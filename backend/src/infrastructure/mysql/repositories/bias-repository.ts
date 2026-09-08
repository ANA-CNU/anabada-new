import { z } from "zod";
import type { DatabaseExecutor } from "../database-session.js";
import { sqlOperations } from "../database-session.js";

const operations = {
  clear: sqlOperations.biasClear,
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
    await this.database.execute(
      operations.clear,
      "DELETE FROM user_bias_total",
      [],
    );
    const totals = await this.database.select(
      operations.aggregate,
      "SELECT user_id, COALESCE(SUM(bias), 0) AS total_point FROM score_history WHERE created_at >= ? AND created_at < ? GROUP BY user_id",
      [beginUtc, endUtc],
      aggregateSchema,
    );
    if (totals.length === 0) return 0;
    await this.database.execute(
      operations.insert,
      `INSERT INTO user_bias_total (user_id, total_point) VALUES ${totals.map(() => "(?, ?)").join(", ")}`,
      totals.flatMap((total) => [total.user_id, total.total_point]),
    );
    return totals.length;
  }
  async list(): Promise<readonly BiasUser[]> {
    return this.database.select(
      operations.list,
      "SELECT u.id AS user_id, u.jungol_name, u.korean_name, COALESCE(u.korean_name, u.jungol_name) AS display_name, COALESCE(ubt.total_point, 0) AS total_point, ubt.updated_at FROM user u LEFT JOIN user_bias_total ubt ON ubt.user_id = u.id ORDER BY total_point DESC, u.jungol_name ASC",
      [],
      biasUserSchema,
    );
  }
}
