import { expect } from "bun:test";
import type { RowDataPacket } from "mysql2";
import type { MysqlTestContext } from "../context.js";

type ActiveRow = RowDataPacket & Readonly<{ readonly id: number }>;

const request = (path: string, init?: RequestInit): Request =>
  new Request(`http://integration.test${path}`, init);

async function activeIds(
  context: MysqlTestContext,
): Promise<readonly number[]> {
  const [rows] = await context.rawPool.query<ActiveRow[]>(
    "SELECT id FROM ranking_boards WHERE is_active=1 ORDER BY id",
  );
  return rows.map((row) => row.id);
}

export async function runAdminRankingBoardCases(
  context: MysqlTestContext,
): Promise<void> {
  await context.seed();
  context.clearIncidents();
  const list = await context.handle(
    request("/api/admin/ranking-boards?page=1&limit=1"),
  );
  expect(list.status).toBe(200);
  expect(await list.json()).toEqual({
    success: true,
    data: [
      {
        id: 502,
        title: "현재 보드",
        created_at: "2026-09-08T00:00:00.000Z",
        is_active: true,
        member_count: 2,
      },
    ],
    pagination: { page: 1, limit: 1, total: 2, total_pages: 2 },
  });
  const detail = await context.handle(request("/api/admin/ranking-boards/501"));
  expect(detail.status).toBe(200);
  expect(await detail.json()).toEqual({
    success: true,
    data: {
      board: {
        id: 501,
        title: "이전 보드",
        created_at: "2026-08-31T00:00:00.000Z",
        is_active: false,
        member_count: 2,
      },
      members: [
        { rank: 1, user_id: 2, jungol_name: "beta", tier: 8 },
        { rank: 2, user_id: 1, jungol_name: "alpha", tier: 12 },
      ],
    },
  });
  const activate = await context.handle(
    request("/api/admin/ranking-boards/501/active", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    }),
  );
  expect(activate.status).toBe(200);
  expect(await activeIds(context)).toEqual([501]);
  const selected = await context.handle(
    request("/api/ranking/selected-month-board"),
  );
  const selectedJson = (await selected.json()) as Readonly<{
    readonly data: readonly Readonly<{ readonly jungol_name: string }>[];
  }>;
  expect(selectedJson.data.map((member) => member.jungol_name)).toEqual([
    "beta",
    "alpha",
  ]);
  const repeated = await context.handle(
    request("/api/admin/ranking-boards/501/active", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    }),
  );
  expect(repeated.status).toBe(200);
  expect(await activeIds(context)).toEqual([501]);
  const deactivate = await context.handle(
    request("/api/admin/ranking-boards/501/active", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    }),
  );
  expect(deactivate.status).toBe(200);
  expect(await activeIds(context)).toEqual([]);
  const emptySelected = await context.handle(
    request("/api/ranking/selected-month-board"),
  );
  const emptySelectedJson = (await emptySelected.json()) as Readonly<{
    readonly data: readonly unknown[];
  }>;
  expect(emptySelectedJson.data).toEqual([]);
  await context.seed();
  const deactivateInactive = await context.handle(
    request("/api/admin/ranking-boards/501/active", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    }),
  );
  expect(deactivateInactive.status).toBe(200);
  expect(await activeIds(context)).toEqual([502]);
  const invalid = await context.handle(request("/api/admin/ranking-boards/0"));
  expect(invalid.status).toBe(400);
  const malformedPage = await context.handle(
    request("/api/admin/ranking-boards?page=1e2"),
  );
  expect(malformedPage.status).toBe(400);
  const oversizedLimit = await context.handle(
    request("/api/admin/ranking-boards?limit=101"),
  );
  expect(oversizedLimit.status).toBe(400);
  const oversizedId = await context.handle(
    request("/api/admin/ranking-boards/9999999999"),
  );
  expect(oversizedId.status).toBe(400);
  const invalidBody = await context.handle(
    request("/api/admin/ranking-boards/501/active", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: "true" }),
    }),
  );
  expect(invalidBody.status).toBe(400);
  const missing = await context.handle(
    request("/api/admin/ranking-boards/999"),
  );
  expect(missing.status).toBe(404);
  const missingPatch = await context.handle(
    request("/api/admin/ranking-boards/999/active", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    }),
  );
  expect(missingPatch.status).toBe(404);
  expect(await activeIds(context)).toEqual([502]);
  await context.rawPool.query(
    "CREATE TRIGGER reject_board_switch BEFORE UPDATE ON ranking_boards FOR EACH ROW BEGIN IF NEW.id=501 AND NEW.is_active=1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test rejection'; END IF; END",
  );
  try {
    const rejected = await context.handle(
      request("/api/admin/ranking-boards/501/active", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: true }),
      }),
    );
    expect(rejected.status).toBe(503);
  } finally {
    await context.rawPool.query("DROP TRIGGER reject_board_switch");
  }
  expect(await activeIds(context)).toEqual([502]);
  expect(context.incidents).toHaveLength(1);
  context.clearIncidents();
  expect(context.incidents).toEqual([]);
  await context.seed();
  const concurrent = await Promise.all(
    [501, 502].map((id) =>
      context.handle(
        request(`/api/admin/ranking-boards/${id}/active`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: true }),
        }),
      ),
    ),
  );
  expect(concurrent.map((response) => response.status)).toEqual([200, 200]);
  expect(await activeIds(context)).toHaveLength(1);
  expect(context.incidents).toEqual([]);
}
