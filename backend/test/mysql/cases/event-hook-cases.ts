import { expect } from "bun:test";
import type { RowDataPacket } from "mysql2";
import { sqlOperations } from "../../../src/infrastructure/mysql/database-session.js";
import type { MysqlTestContext } from "../context.js";
import { runEventRollbackCase } from "./event-rollback-cases.js";
import { runHookCases } from "./hook-cases.js";

type EventProblemRow = RowDataPacket &
  Readonly<{ readonly problem: number; readonly added_at: Date }>;
type CountRow = RowDataPacket & Readonly<{ readonly total: number }>;

const jsonRequest = (method: string, path: string, body?: object): Request =>
  new Request(`http://test${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

const eventInput = (problems: readonly number[]) => ({
  title: "새 이벤트",
  desc: "MySQL 실제 경로",
  begin: "2026-09-10 09:00:00",
  end: "2026-09-11 09:00:00",
  problems,
});

async function eventCount(context: MysqlTestContext): Promise<number> {
  const [rows] = await context.rawPool.query<CountRow[]>(
    "SELECT COUNT(*) AS total FROM event",
  );
  const row = rows[0];
  if (!row) throw new Error("event count query returned no row");
  return Number(row.total);
}

async function expectEventReads(context: MysqlTestContext): Promise<void> {
  const ongoing = await context.handle(
    jsonRequest("GET", "/api/events/ongoing"),
  );
  expect(ongoing.status).toBe(200);
  expect(await ongoing.json()).toEqual({
    success: true,
    data: [
      {
        event_title: "진행 이벤트",
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-10-01T00:00:00.000Z",
        problems: "1000",
      },
    ],
    message: "현재 진행중인 이벤트 조회 성공",
    summary: { count: 1, status: "진행중", max_limit: 3 },
  });

  const past = await context.handle(jsonRequest("GET", "/api/events/past"));
  expect(past.status).toBe(200);
  expect(await past.json()).toEqual({
    success: true,
    data: [
      {
        event_title: "과거 이벤트",
        startDate: "2026-08-01T00:00:00.000Z",
        endDate: "2026-08-31T00:00:00.000Z",
        problems: "2000",
      },
    ],
    message: "과거 진행된 이벤트 조회 성공",
    summary: { count: 1, status: "종료됨", max_limit: 3 },
  });

  const list = await context.handle(
    jsonRequest("GET", "/api/events?page=1&limit=1"),
  );
  expect(list.status).toBe(200);
  expect(await list.json()).toEqual({
    success: true,
    data: [
      {
        id: 201,
        title: "진행 이벤트",
        desc: "현재",
        begin: "2026-09-01T00:00:00.000Z",
        end: "2026-10-01T00:00:00.000Z",
        created_at: "2026-09-01T00:00:00.000Z",
        problem_count: 1,
      },
    ],
    pagination: { page: 1, limit: 1, total: 2, total_pages: 2 },
    message: "이벤트 목록 조회 성공",
  });

  const detail = await context.handle(jsonRequest("GET", "/api/events/201"));
  expect(detail.status).toBe(200);
  expect(await detail.json()).toEqual({
    success: true,
    data: {
      id: 201,
      title: "진행 이벤트",
      desc: "현재",
      begin: "2026-09-01T00:00:00.000Z",
      end: "2026-10-01T00:00:00.000Z",
      created_at: "2026-09-01T00:00:00.000Z",
      problems: [1000],
    },
    message: "이벤트 상세 조회 성공",
  });
  expect(
    (await context.handle(jsonRequest("GET", "/api/events/nope"))).status,
  ).toBe(400);
  expect(
    (await context.handle(jsonRequest("GET", "/api/events/999999"))).status,
  ).toBe(404);
}

async function expectEventMutations(context: MysqlTestContext): Promise<void> {
  context.clearIncidents();
  const legacy = await context.handle(
    jsonRequest("POST", "/api/event/create", {
      ...eventInput([3000]),
      problems: "3000,3001",
    }),
  );
  expect(legacy.status).toBe(400);
  expect(context.incidents).toEqual([]);

  const beforeDuplicate = await eventCount(context);
  const duplicate = await context.handle(
    jsonRequest("POST", "/api/event/create", eventInput([3000, 3000])),
  );
  expect(duplicate.status).toBe(400);
  expect(await eventCount(context)).toBe(beforeDuplicate);

  const create = await context.handle(
    jsonRequest("POST", "/api/event/create", eventInput([3000])),
  );
  expect(create.status).toBe(200);
  const created = await create.json();
  expect(created).toMatchObject({ success: true, problems_count: 1 });
  const createdId = Number(created.event_id);
  expect(Number.isInteger(createdId)).toBe(true);

  const [beforeRows] = await context.rawPool.query<EventProblemRow[]>(
    "SELECT problem, added_at FROM event_problem WHERE event_id = ? ORDER BY problem",
    [201],
  );
  expect(beforeRows).toHaveLength(1);
  const retained = beforeRows[0];
  if (!retained) throw new Error("seeded event problem was not persisted");

  const update = await context.handle(
    jsonRequest("PUT", "/api/events/201", {
      ...eventInput([1000, 1001]),
      title: "수정 이벤트",
      desc: null,
    }),
  );
  expect(update.status).toBe(200);
  const [afterRows] = await context.rawPool.query<EventProblemRow[]>(
    "SELECT problem, added_at FROM event_problem WHERE event_id = ? ORDER BY problem",
    [201],
  );
  expect(afterRows.map((row) => row.problem)).toEqual([1000, 1001]);
  const afterRetained = afterRows[0];
  const added = afterRows[1];
  if (!afterRetained || !added)
    throw new Error("updated event problems were not persisted");
  expect(afterRetained.added_at.toISOString()).toBe(
    retained.added_at.toISOString(),
  );
  expect(added.added_at.getTime()).toBeGreaterThan(retained.added_at.getTime());

  const removeMembership = await context.handle(
    jsonRequest("PUT", "/api/events/201", eventInput([1001])),
  );
  expect(removeMembership.status).toBe(200);
  const [remainingRows] = await context.rawPool.query<EventProblemRow[]>(
    "SELECT problem, added_at FROM event_problem WHERE event_id = ? ORDER BY problem",
    [201],
  );
  expect(remainingRows.map((row) => row.problem)).toEqual([1001]);

  expect(
    (
      await context.handle(
        jsonRequest("PUT", "/api/events/invalid", eventInput([1])),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await context.handle(
        jsonRequest("PUT", "/api/events/999999", eventInput([1])),
      )
    ).status,
  ).toBe(400);

  const deleted = await context.handle(
    jsonRequest("DELETE", `/api/events/${createdId}`),
  );
  expect(deleted.status).toBe(200);
  expect(
    (await context.handle(jsonRequest("DELETE", `/api/events/${createdId}`)))
      .status,
  ).toBe(404);
}

export async function runEventHookCases(
  context: MysqlTestContext,
): Promise<void> {
  await context.seed();
  await expectEventReads(context);
  await expectEventMutations(context);
  await runEventRollbackCase(context);
  await runHookCases(context);

  const requiredOperationIds = [
    sqlOperations.eventOngoing.id,
    sqlOperations.eventPast.id,
    sqlOperations.eventList.id,
    sqlOperations.eventFind.id,
    sqlOperations.eventCreate.id,
    sqlOperations.eventLock.id,
    sqlOperations.eventUpdate.id,
    sqlOperations.eventDelete.id,
    sqlOperations.eventProblemsList.id,
    sqlOperations.eventProblemsInsert.id,
    sqlOperations.eventProblemsDelete.id,
    sqlOperations.hookCount.id,
    sqlOperations.hookList.id,
    sqlOperations.hookFind.id,
    sqlOperations.hookCreate.id,
    sqlOperations.hookUpdate.id,
    sqlOperations.hookRemove.id,
    sqlOperations.hookToggle.id,
  ] as const;
  expect(
    requiredOperationIds.every((id) => context.observedOperationIds.has(id)),
  ).toBe(true);
}
