import { expect } from "bun:test";
import type { RowDataPacket } from "mysql2";
import type { MysqlTestContext } from "../context.js";

type CountRow = RowDataPacket & Readonly<{ readonly total: number }>;

function request(method: string, path: string, body?: object): Request {
  return new Request(`http://test${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function eventCount(context: MysqlTestContext): Promise<number> {
  const [rows] = await context.rawPool.query<CountRow[]>(
    "SELECT COUNT(*) AS total FROM event",
  );
  const row = rows[0];
  if (!row) throw new Error("event count query returned no row");
  return Number(row.total);
}

export async function runEventRollbackCase(
  context: MysqlTestContext,
): Promise<void> {
  const trigger = "test_event_problem_reject";
  await context.rawPool.query(`DROP TRIGGER IF EXISTS \`${trigger}\``);
  await context.rawPool.query(
    `CREATE TRIGGER \`${trigger}\` BEFORE INSERT ON event_problem FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'reject event problem'`,
  );
  try {
    const before = await eventCount(context);
    const response = await context.handle(
      request("POST", "/api/event/create", {
        title: "새 이벤트",
        desc: "MySQL 실제 경로",
        begin: "2026-09-10 09:00:00",
        end: "2026-09-11 09:00:00",
        problems: [3999],
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Service unavailable" });
    expect(await eventCount(context)).toBe(before);
    const [rows] = await context.rawPool.query<CountRow[]>(
      "SELECT COUNT(*) AS total FROM event_problem WHERE problem = 3999",
    );
    expect(Number(rows[0]?.total)).toBe(0);
  } finally {
    await context.rawPool.query(`DROP TRIGGER IF EXISTS \`${trigger}\``);
  }
}
