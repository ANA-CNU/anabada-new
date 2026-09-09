import { z } from "zod";
import type { DatabaseExecutor } from "../database-session.js";
import { sqlOperations } from "../database-session.js";

const readySchema = z.object({ ready: z.coerce.number().pipe(z.literal(1)) });
const migrationSchema = z.object({
  version: z.coerce.number().int().nonnegative(),
});
const tableSchema = z.object({ table_name: z.string() });
export const requiredApplicationTables = [
  "event",
  "event_problem",
  "hook",
  "problem",
  "ranking_boards",
  "ranked_users",
  "score_history",
  "user",
  "user_bias_total",
] as const;

export class HealthRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async ready(): Promise<boolean> {
    const result = await this.database.selectOne(
      sqlOperations.healthReady,
      "SELECT 1 AS ready",
      [],
      readySchema,
    );
    return result !== undefined;
  }

  async hasRequiredMigration(): Promise<boolean> {
    return (
      (await this.database.selectOne(
        sqlOperations.healthMigrations,
        "SELECT version FROM migrations WHERE version >= ? ORDER BY version DESC LIMIT 1",
        [2],
        migrationSchema,
      )) !== undefined
    );
  }
  async hasRequiredTables(): Promise<boolean> {
    const placeholders = requiredApplicationTables.map(() => "?").join(", ");
    const rows = await this.database.select(
      sqlOperations.healthTables,
      `SELECT table_name AS table_name FROM information_schema.tables WHERE table_schema = 'jungol_bada' AND table_name IN (${placeholders})`,
      requiredApplicationTables,
      tableSchema,
    );
    return (
      new Set(rows.map((row) => row.table_name)).size ===
      requiredApplicationTables.length
    );
  }
  async check(): Promise<boolean> {
    return (
      (await this.ready()) &&
      (await this.hasRequiredMigration()) &&
      (await this.hasRequiredTables())
    );
  }
}
