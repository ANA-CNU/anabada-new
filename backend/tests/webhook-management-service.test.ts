import { expect, test } from "bun:test";
import type { z } from "zod";
import { WebhookManagementService } from "../src/api/hook/webhook-management-service.js";
import type {
  DatabaseExecutor,
  SqlOperation,
  SqlParameter,
} from "../src/infrastructure/mysql/database-session.js";

class RecordingExecutor implements DatabaseExecutor {
  readonly calls: string[] = [];

  async select<T>(
    operation: SqlOperation,
    _sql: string,
    _values: readonly SqlParameter[],
    _schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<readonly T[]> {
    this.calls.push(operation.id);
    return [];
  }

  async selectOne<T>(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T | undefined> {
    return (await this.select(operation, sql, values, schema))[0];
  }

  async execute(
    operation: SqlOperation,
    _sql: string,
    _values: readonly SqlParameter[],
  ) {
    this.calls.push(operation.id);
    return { affectedRows: 1, insertId: 73 };
  }
}

test("Given a database session When an administrator creates a webhook Then the service stores it through the hook repository", async () => {
  const executor = new RecordingExecutor();
  const service = new WebhookManagementService({
    withSession: (work) => work(executor),
  });

  const id = await service.create({
    url: "https://example.test/webhook",
    ignored: false,
  });

  expect(id).toBe(73);
  expect(executor.calls).toEqual(["hook.create"]);
});
