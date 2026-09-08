import { expect } from "bun:test";
import type { RowDataPacket } from "mysql2";
import { sqlOperations } from "../../../src/infrastructure/mysql/database-session.js";
import type { MysqlTestContext } from "../context.js";

const request = (method: string, path: string, body?: object): Request =>
  new Request(`http://test${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

type HookRow = RowDataPacket &
  Readonly<{ readonly ignored: number; readonly url: string }>;

async function persistedHook(
  context: MysqlTestContext,
  id: number,
): Promise<{ readonly ignored: number; readonly url: string } | undefined> {
  const [rows] = await context.rawPool.query<HookRow[]>(
    "SELECT url, ignored FROM hook WHERE id = ?",
    [id],
  );
  const row = rows[0];
  return row ? { ignored: Number(row.ignored), url: row.url } : undefined;
}

async function expectContractFailure(context: MysqlTestContext): Promise<void> {
  context.clearIncidents();
  await context.rawPool.query("INSERT INTO hook (url, ignored) VALUES (?, ?)", [
    "https://contract.invalid/hook",
    2,
  ]);
  const response = await context.handle(request("GET", "/api/hooks?limit=100"));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Service unavailable" });
  expect(context.incidents).toEqual([
    {
      code: "database_contract_invalid",
      occurredAt: new Date("2026-09-08T06:00:00.000Z"),
      operationId: sqlOperations.hookList.id,
      routeTemplate: "GET /api/hooks",
    },
  ]);
}

async function expectQueryFailure(context: MysqlTestContext): Promise<void> {
  const backup = "hook_mysql_contract_backup";
  context.clearIncidents();
  await context.rawPool.query(`DROP TABLE IF EXISTS \`${backup}\``);
  await context.rawPool.query(`RENAME TABLE hook TO \`${backup}\``);
  try {
    const response = await context.handle(request("GET", "/api/hooks"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Service unavailable" });
    expect(context.incidents).toEqual([
      {
        code: "database_query_failed",
        occurredAt: new Date("2026-09-08T06:00:00.000Z"),
        operationId: sqlOperations.hookCount.id,
        routeTemplate: "GET /api/hooks",
      },
    ]);
  } finally {
    await context.rawPool.query(`RENAME TABLE \`${backup}\` TO hook`);
  }
}

export async function runHookCases(context: MysqlTestContext): Promise<void> {
  await context.seed();
  const list = await context.handle(
    request("GET", "/api/hooks?page=1&limit=1"),
  );
  expect(list.status).toBe(200);
  expect((await list.json()).success).toBe(true);
  expect(
    (await context.handle(request("GET", "/api/hooks/invalid"))).status,
  ).toBe(400);
  expect(
    (await context.handle(request("GET", "/api/hooks/999999"))).status,
  ).toBe(404);
  const created = await context.handle(
    request("POST", "/api/hooks", {
      url: "https://new.invalid/hook",
      ignored: false,
    }),
  );
  expect(created.status).toBe(200);
  const createdBody = await created.json();
  const hookId = Number(createdBody.hook_id);
  expect(Number.isInteger(hookId)).toBe(true);
  expect(
    (
      await context.handle(
        request("POST", "/api/hooks", {
          url: "ftp://invalid.example/hook",
          ignored: false,
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await context.handle(
        request("POST", "/api/hooks", {
          url: "https://bad.invalid",
          ignored: 0,
        }),
      )
    ).status,
  ).toBe(400);
  const detail = await context.handle(request("GET", `/api/hooks/${hookId}`));
  expect(detail.status).toBe(200);
  expect(await detail.json()).toMatchObject({
    success: true,
    data: { id: hookId },
  });
  expect(
    (
      await context.handle(
        request("PUT", `/api/hooks/${hookId}`, { ignored: 1 }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await context.handle(
        request("PUT", `/api/hooks/${hookId}`, {
          url: "https://updated.invalid/hook",
          ignored: true,
        }),
      )
    ).status,
  ).toBe(200);
  expect(await persistedHook(context, hookId)).toEqual({
    ignored: 1,
    url: "https://updated.invalid/hook",
  });
  expect(
    (await context.handle(request("PATCH", `/api/hooks/${hookId}/toggle`)))
      .status,
  ).toBe(200);
  expect(await persistedHook(context, hookId)).toEqual({
    ignored: 0,
    url: "https://updated.invalid/hook",
  });
  expect(
    (await context.handle(request("PATCH", "/api/hooks/999999/toggle"))).status,
  ).toBe(404);
  expect(
    (await context.handle(request("DELETE", `/api/hooks/${hookId}`))).status,
  ).toBe(200);
  expect(
    (await context.handle(request("DELETE", `/api/hooks/${hookId}`))).status,
  ).toBe(404);
  await expectContractFailure(context);
  await expectQueryFailure(context);
}
