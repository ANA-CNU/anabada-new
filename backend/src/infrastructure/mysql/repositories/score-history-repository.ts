import { z } from "zod";
import type { DatabaseExecutor } from "../database-session.js";
import { sqlOperations } from "../database-session.js";

const operations = {
  userExists: sqlOperations.scoreHistoryUserExists,
  eventExists: sqlOperations.scoreHistoryEventExists,
  problemOwner: sqlOperations.scoreHistoryProblemOwner,
  eventProblem: sqlOperations.scoreHistoryEventProblem,
  insert: sqlOperations.scoreHistoryInsert,
  count: sqlOperations.scoreHistoryCount,
  list: sqlOperations.scoreHistoryList,
  update: sqlOperations.scoreHistoryUpdate,
  remove: sqlOperations.scoreHistoryRemove,
} as const;

const existsSchema = z.object({ id: z.coerce.number().int().positive() });
const totalSchema = z.object({ total: z.coerce.number().int().nonnegative() });
const utcDate = z.date().transform((value) => value.toISOString());
const scoreDay = z
  .date()
  .nullable()
  .transform((value) => value?.toISOString().slice(0, 10) ?? null);
export const adminScoreHistorySchema = z.object({
  id: z.number().int().nonnegative(),
  user_id: z.number().int().positive(),
  display_name: z.string(),
  jungol_name: z.string(),
  korean_name: z.string().nullable(),
  desc: z.string().nullable(),
  bias: z.number().int(),
  rule_type: z.enum(["manual", "daily", "event"]),
  score_day: scoreDay,
  event_id: z.number().int().positive().nullable(),
  problem_id: z.string().regex(/^\d+$/).nullable(),
  created_at: utcDate,
});
export type AdminScoreHistory = Readonly<
  z.output<typeof adminScoreHistorySchema>
>;

export type ManualScoreHistory = Readonly<{
  user_id: number;
  bias: number;
  desc: string | null;
  event_id: number | null;
  problem_id: string | null;
}>;
export type ScoreHistoryPatch = Readonly<
  Partial<Omit<ManualScoreHistory, "user_id">>
>;

export class ScoreHistoryRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async referencesExist(record: ManualScoreHistory): Promise<string | null> {
    if (
      !(await this.database.selectOne(
        operations.userExists,
        "SELECT 1 AS id FROM user WHERE id = ?",
        [record.user_id],
        existsSchema,
      ))
    )
      return "사용자가 존재하지 않습니다.";
    if (
      record.event_id !== null &&
      !(await this.database.selectOne(
        operations.eventExists,
        "SELECT 1 AS id FROM event WHERE id = ?",
        [record.event_id],
        existsSchema,
      ))
    )
      return "이벤트가 존재하지 않습니다.";
    if (record.problem_id !== null) {
      const owner = await this.database.selectOne(
        operations.problemOwner,
        "SELECT 1 AS id FROM problem WHERE id = ? AND user_id = ?",
        [record.problem_id, record.user_id],
        existsSchema,
      );
      if (!owner) return "문제가 존재하지 않거나 사용자 소유가 아닙니다.";
      if (record.event_id !== null) {
        const linked = await this.database.selectOne(
          operations.eventProblem,
          "SELECT 1 AS id FROM event_problem ep JOIN problem p ON p.problem = ep.problem WHERE ep.event_id = ? AND p.id = ?",
          [record.event_id, record.problem_id],
          existsSchema,
        );
        if (!linked) return "문제가 이벤트에 연결되어 있지 않습니다.";
      }
    }
    return null;
  }

  async insertManual(records: readonly ManualScoreHistory[]): Promise<void> {
    if (records.length === 0) return;
    await this.database.execute(
      operations.insert,
      `INSERT INTO score_history (user_id, bias, rule_type, award_key, score_day, \`desc\`, event_id, problem_id, created_at) VALUES ${records.map(() => "(?, ?, 'manual', NULL, NULL, ?, ?, ?, CURRENT_TIMESTAMP)").join(", ")}`,
      records.flatMap((record) => [
        record.user_id,
        record.bias,
        record.desc,
        record.event_id,
        record.problem_id,
      ]),
    );
  }

  async list(
    page: number,
    limit: number,
    username: string | undefined,
  ): Promise<Readonly<{ total: number; data: readonly AdminScoreHistory[] }>> {
    const filter =
      username === undefined
        ? ""
        : " WHERE u.jungol_name LIKE ? OR u.korean_name LIKE ?";
    const values =
      username === undefined ? [] : [`%${username}%`, `%${username}%`];
    const total = await this.database.selectOne(
      operations.count,
      `SELECT COUNT(*) AS total FROM score_history sh JOIN user u ON u.id = sh.user_id${filter}`,
      values,
      totalSchema,
    );
    const data = await this.database.select(
      operations.list,
      `SELECT sh.id, sh.user_id, COALESCE(u.korean_name, u.jungol_name) AS display_name, u.jungol_name, u.korean_name, sh.\`desc\`, sh.bias, sh.rule_type, sh.score_day, sh.event_id, CAST(sh.problem_id AS CHAR) AS problem_id, sh.created_at FROM score_history sh JOIN user u ON u.id = sh.user_id${filter} ORDER BY sh.created_at DESC, sh.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit],
      adminScoreHistorySchema,
    );
    return { total: total?.total ?? 0, data };
  }

  async update(id: number, patch: ScoreHistoryPatch): Promise<boolean> {
    const entries = Object.entries(patch) as readonly (readonly [
      keyof ScoreHistoryPatch,
      string | number | null,
    ])[];
    const columns: Record<keyof ScoreHistoryPatch, string> = {
      desc: "`desc`",
      bias: "bias",
      event_id: "event_id",
      problem_id: "problem_id",
    };
    const sql = `UPDATE score_history SET ${entries.map(([field]) => `${columns[field]} = ?`).join(", ")} WHERE id = ?`;
    const result = await this.database.execute(operations.update, sql, [
      ...entries.map(([, value]) => value),
      id,
    ]);
    return result.affectedRows === 1;
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.database.execute(
      operations.remove,
      "DELETE FROM score_history WHERE id = ?",
      [id],
    );
    return result.affectedRows === 1;
  }
}
