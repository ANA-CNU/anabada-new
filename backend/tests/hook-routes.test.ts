import { expect, test } from "bun:test";
import type { z } from "zod";
import { createHookRoutes } from "../src/api/hook/hook.js";
import type {
  DatabaseExecutor,
  SqlOperation,
  SqlParameter,
} from "../src/infrastructure/mysql/database-session.js";

type Call = Readonly<{
  readonly operation: string;
  readonly values: readonly SqlParameter[];
}>;

class RecordingExecutor implements DatabaseExecutor {
  readonly calls: Call[] = [];

  constructor(private readonly affectedRows: number = 1) {}

  async select<T>(
    operation: SqlOperation,
    _sql: string,
    values: readonly SqlParameter[],
    _schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<readonly T[]> {
    this.calls.push({ operation: operation.id, values });
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
    values: readonly SqlParameter[],
  ) {
    this.calls.push({ operation: operation.id, values });
    return { affectedRows: this.affectedRows, insertId: 91 };
  }
}

const request = (method: string, path: string, body?: object): Request =>
  new Request(`http://test${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

test("Given an authorized administrator When posting a webhook without ignored Then the route stores an active hook", async () => {
  const executor = new RecordingExecutor();
  let sessions = 0;
  const app = createHookRoutes({
    authorizer: () => true,
    withSession: async (work) => {
      sessions += 1;
      return work(executor);
    },
  });

  const response = await app.handle(
    request("POST", "/api/hooks", { url: "https://example.test/hook" }),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    success: true,
    hook_id: 91,
    message: "Webhook 생성 성공",
  });
  expect(sessions).toBe(1);
  expect(executor.calls).toEqual([
    { operation: "hook.create", values: ["https://example.test/hook", 0] },
  ]);
});

test("Given an unauthorized or invalid webhook request When posting Then the route rejects it before opening a database session", async () => {
  const executor = new RecordingExecutor();
  let sessions = 0;
  const withSession = async <T>(
    work: (session: DatabaseExecutor) => Promise<T>,
  ): Promise<T> => {
    sessions += 1;
    return work(executor);
  };
  const unauthorized = createHookRoutes({
    authorizer: () => false,
    withSession,
  });
  const invalid = createHookRoutes({ authorizer: () => true, withSession });

  const unauthorizedResponse = await unauthorized.handle(
    request("POST", "/api/hooks", { url: "https://example.test/hook" }),
  );
  const invalidResponse = await invalid.handle(
    request("POST", "/api/hooks", { url: "ftp://example.test/hook" }),
  );

  expect(unauthorizedResponse.status).toBe(401);
  expect(invalidResponse.status).toBe(400);
  expect(sessions).toBe(0);
  expect(executor.calls).toEqual([]);
});

test("Given missing webhook records When updating, toggling, or deleting Then the route preserves its 404 contract", async () => {
  const executor = new RecordingExecutor(0);
  const app = createHookRoutes({
    authorizer: () => true,
    withSession: (work) => work(executor),
  });

  const update = await app.handle(
    request("PUT", "/api/hooks/91", { ignored: true }),
  );
  const toggle = await app.handle(request("PATCH", "/api/hooks/91/toggle"));
  const remove = await app.handle(request("DELETE", "/api/hooks/91"));

  expect(update.status).toBe(404);
  expect(toggle.status).toBe(404);
  expect(remove.status).toBe(404);
});
