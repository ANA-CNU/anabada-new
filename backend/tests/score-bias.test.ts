import { describe, expect, test } from "bun:test";
import type { z } from "zod";
import { ScoreHistoryService } from "../src/api/score_history/score-history-service.js";
import { BiasService } from "../src/api/user_total_bias/bias-service.js";
import type {
  DatabaseExecutor,
  SqlOperation,
  SqlParameter,
} from "../src/infrastructure/mysql/database-session.js";

class FakeExecutor implements DatabaseExecutor {
  readonly calls: string[] = [];
  failInsert = false;
  private userExistsChecks = 0;
  async select<T>(
    operation: SqlOperation,
    _sql: string,
    _values: readonly SqlParameter[],
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<readonly T[]> {
    this.calls.push(operation.id);
    if (operation.id === "bias.aggregate")
      return schema.array().parse([{ user_id: 1, total_point: 4 }]);
    return schema.array().parse([]);
  }
  async selectOne<T>(
    operation: SqlOperation,
    _sql: string,
    _values: readonly SqlParameter[],
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T | undefined> {
    this.calls.push(operation.id);
    if (operation.id === "score_history.user_exists") {
      this.userExistsChecks += 1;
      return this.userExistsChecks === 1 ? schema.parse({ id: 1 }) : undefined;
    }
    return undefined;
  }
  async execute(
    operation: SqlOperation,
  ): Promise<Readonly<{ affectedRows: number; insertId: number }>> {
    this.calls.push(operation.id);
    if (this.failInsert && operation.id === "bias.insert")
      throw new Error("injected");
    return { affectedRows: 1, insertId: 1 };
  }
}

describe("score and bias service transaction boundaries", () => {
  test("bulk keeps expected missing references as per-record failures", async () => {
    const database = new FakeExecutor();
    const service = new ScoreHistoryService(
      { withSession: async (work) => work(database) },
      { unitOfWork: async (work) => work(database) },
    );
    const result = await service.bulk([
      { user_id: 1, bias: 3, desc: null, event_id: null, problem_id: null },
      { user_id: 2, bias: 3, desc: null, event_id: null, problem_id: null },
    ]);
    expect(result).toEqual({
      insertedCount: 1,
      failed: [{ user_id: 2, reason: "사용자가 존재하지 않습니다." }],
    });
    expect(database.calls).toEqual([
      "score_history.user_exists",
      "score_history.user_exists",
      "score_history.insert",
    ]);
  });
  test("bias replacement delegates clear, aggregate, and insert to a single unit of work", async () => {
    const database = new FakeExecutor();
    let transactions = 0;
    const service = new BiasService(
      { withSession: async (work) => work(database) },
      {
        unitOfWork: async (work) => {
          transactions += 1;
          return work(database);
        },
      },
    );
    await expect(
      service.initialize(
        new Date("2026-01-01T00:00:00Z"),
        new Date("2026-02-01T00:00:00Z"),
      ),
    ).resolves.toBe(1);
    expect(transactions).toBe(1);
    expect(database.calls).toEqual([
      "bias.clear",
      "bias.aggregate",
      "bias.insert",
    ]);
  });
});
