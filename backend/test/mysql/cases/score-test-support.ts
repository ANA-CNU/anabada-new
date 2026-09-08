import type { RowDataPacket } from "mysql2";
import type { MysqlTestContext } from "../context.js";

type ScoreRow = RowDataPacket &
  Readonly<{
    readonly id: number;
    readonly user_id: number;
    readonly bias: number;
    readonly rule_type: string;
    readonly award_key: string | null;
    readonly score_day: Date | null;
    readonly event_id: number | null;
    readonly problem_id: string | null;
    readonly desc: string | null;
  }>;

type CountRow = RowDataPacket & Readonly<{ readonly total: number }>;

export const jsonScoreRequest = (
  path: string,
  method: string,
  body?: unknown,
): Request =>
  new Request(`http://test${path}`, {
    method,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export async function scoreRows(
  context: MysqlTestContext,
  description: string,
): Promise<readonly ScoreRow[]> {
  const [rows] = await context.rawPool.query<ScoreRow[]>(
    "SELECT id, user_id, bias, rule_type, award_key, score_day, event_id, CAST(problem_id AS CHAR) AS problem_id, `desc` FROM score_history WHERE `desc` = ? ORDER BY id",
    [description],
  );
  return rows;
}

export async function scoreCount(context: MysqlTestContext): Promise<number> {
  const [rows] = await context.rawPool.query<CountRow[]>(
    "SELECT COUNT(*) AS total FROM score_history",
  );
  const row = rows[0];
  if (row === undefined) throw new Error("score count query returned no row");
  return Number(row.total);
}
