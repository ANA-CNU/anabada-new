import type { RowDataPacket } from "mysql2";
import { sqlOperations } from "../../../src/infrastructure/mysql/database-session.js";
import type { MysqlTestContext } from "../context.js";

type UserRow = Readonly<{
  readonly jungol_name: string;
  readonly corrects: number;
  readonly submissions: number;
  readonly solution: string;
  readonly korean_name: string | null;
  readonly tier: number;
  readonly ac_rating: number;
  readonly ignored: number;
  readonly jungol_account_id: string;
  readonly rank_wrong_count: number;
}>;
type RawUserRow = RowDataPacket & UserRow;

export const canonicalUserFields = [
  "ac_rating",
  "corrects",
  "id",
  "ignored",
  "jungol_account_id",
  "jungol_name",
  "korean_name",
  "rank_wrong_count",
  "solution",
  "submissions",
  "tier",
] as const;

export const userRequest = (
  context: MysqlTestContext,
  path: string,
  init?: RequestInit,
): Promise<Response> => context.handle(new Request(`http://test${path}`, init));

export const userMutation = (
  method: "PUT" | "DELETE",
  body?: object,
): RequestInit => ({
  method,
  headers: body ? { "Content-Type": "application/json" } : undefined,
  body: body ? JSON.stringify(body) : undefined,
});

export async function userRow(
  context: MysqlTestContext,
  id: number,
): Promise<UserRow | undefined> {
  const [rows] = await context.rawPool.query<RawUserRow[]>(
    "SELECT jungol_name, corrects, submissions, CAST(solution AS CHAR) AS solution, korean_name, tier, ac_rating, ignored, CAST(jungol_account_id AS CHAR) AS jungol_account_id, rank_wrong_count FROM user WHERE id = ?",
    [id],
  );
  return rows[0];
}

export async function userDependentCount(
  context: MysqlTestContext,
  table: "problem" | "score_history" | "ranked_users" | "user_bias_total",
  userId: number,
): Promise<number> {
  const [rows] = await context.rawPool.query<
    (RowDataPacket & Readonly<{ readonly total: number }>)[]
  >(`SELECT COUNT(*) AS total FROM \`${table}\` WHERE user_id = ?`, [userId]);
  return Number(rows[0]?.total);
}

export function expectUserActivityOperations(context: MysqlTestContext): void {
  const operations = [
    sqlOperations.userList,
    sqlOperations.userFind,
    sqlOperations.userSearch,
    sqlOperations.userUpdate,
    sqlOperations.userRemove,
    sqlOperations.activityUserProblems,
    sqlOperations.activityRecent,
    sqlOperations.activityMonthly,
    sqlOperations.activityMonthlyStats,
    sqlOperations.activityTotal,
  ];
  for (const operation of operations) {
    if (!context.observedOperationIds.has(operation.id)) {
      throw new Error(
        `Expected SQL operation was not observed: ${operation.id}`,
      );
    }
  }
}
