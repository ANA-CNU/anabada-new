import { expect, test } from "bun:test";
import type { z } from "zod";
import type {
  DatabaseExecutor,
  SqlOperation,
  SqlParameter,
} from "../src/infrastructure/mysql/database-session.js";
import { RankingRepository } from "../src/infrastructure/mysql/repositories/ranking-repository.js";

type Query = Readonly<{
  readonly operation: string;
  readonly sql: string;
  readonly values: readonly SqlParameter[];
}>;

class RankingExecutor implements DatabaseExecutor {
  readonly queries: Query[] = [];

  async select<T>(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<readonly T[]> {
    this.queries.push({ operation: operation.id, sql, values });
    return schema.array().parse([]);
  }

  async selectOne<T>(
    _operation: SqlOperation,
    _sql: string,
    _values: readonly SqlParameter[],
    _schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T | undefined> {
    return undefined;
  }

  async execute(
    _operation: SqlOperation,
    _sql: string,
    _values: readonly SqlParameter[],
  ): Promise<Readonly<{ affectedRows: number; insertId: number }>> {
    return { affectedRows: 0, insertId: 0 };
  }
}

test("ranking cache consumers bind the current KST score month", async () => {
  const database = new RankingExecutor();
  const repository = new RankingRepository(database);
  const start = new Date("2026-01-31T15:00:00Z");
  const end = new Date("2026-02-28T15:00:00Z");
  const scoreMonth = "2026-02-01";

  await repository.bias(scoreMonth);
  await repository.latestBias(start, end, scoreMonth);
  await repository.latestBoard(scoreMonth);

  expect(database.queries).toHaveLength(3);
  for (const query of database.queries) {
    expect(query.sql).toContain("score_month=?");
    expect(query.values).toContain(scoreMonth);
  }
  expect(database.queries[1]?.values).toEqual([start, end, scoreMonth]);
});
