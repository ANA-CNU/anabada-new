import { z } from "zod";
import type { DatabaseExecutor } from "../database-session.js";
import { sqlOperations } from "../database-session.js";

const operations = {
  lockUsers: sqlOperations.biasLockUsers,
  aggregate: sqlOperations.biasAggregate,
  insert: sqlOperations.biasInsert,
  list: sqlOperations.biasList,
} as const;
const aggregateSchema = z.object({
  user_id: z.number().int().positive(),
  total_point: z.coerce.number().int(),
});
const utcDateNullable = z
  .date()
  .nullable()
  .transform((value) => value?.toISOString() ?? null);
export const biasUserSchema = z.object({
  user_id: z.number().int().positive(),
  jungol_name: z.string(),
  korean_name: z.string().nullable(),
  display_name: z.string(),
  total_point: z.coerce.number().int(),
  updated_at: utcDateNullable,
});
export type BiasUser = Readonly<z.output<typeof biasUserSchema>>;

export class BiasRepository {
  constructor(private readonly database: DatabaseExecutor) {}
  async replaceTotals(beginUtc: Date, endUtc: Date): Promise<number> {
    const scoreMonth = new Date(beginUtc.getTime() + 9 * 60 * 60 * 1_000)
      .toISOString()
      .slice(0, 7)
      .concat("-01");
    await this.database.select(
      operations.lockUsers,
      "SELECT id FROM user ORDER BY id ASC FOR UPDATE",
      [],
      z.object({ id: z.coerce.number().int().positive() }),
    );
    const totals = await this.database.select(
      operations.aggregate,
      "SELECT u.id AS user_id, COALESCE(SUM(s.bias), 0) AS total_point FROM user u LEFT JOIN score_history s ON s.user_id = u.id AND s.created_at >= ? AND s.created_at < ? GROUP BY u.id",
      [beginUtc, endUtc],
      aggregateSchema,
    );
    if (totals.length === 0) return 0;
    await this.database.execute(
      operations.insert,
      `INSERT INTO user_bias_total (user_id, score_month, total_point) VALUES ${totals.map(() => "(?, ?, ?)").join(", ")} ON DUPLICATE KEY UPDATE score_month=VALUES(score_month),total_point=VALUES(total_point)`,
      totals.flatMap((total) => [total.user_id, scoreMonth, total.total_point]),
    );
    return totals.length;
  }
  async list(now: Date): Promise<readonly BiasUser[]> {
    const scoreMonth = new Date(now.getTime() + 9 * 60 * 60 * 1_000)
      .toISOString()
      .slice(0, 7)
      .concat("-01");
    return this.database.select(
      operations.list,
      "SELECT u.id AS user_id, u.jungol_name, u.korean_name, u.jungol_name AS display_name, COALESCE(ubt.total_point, 0) AS total_point, ubt.updated_at FROM user u LEFT JOIN user_bias_total ubt ON ubt.user_id = u.id AND ubt.score_month=? ORDER BY total_point DESC, u.jungol_name ASC",
      [scoreMonth],
      biasUserSchema,
    );
  }
}
