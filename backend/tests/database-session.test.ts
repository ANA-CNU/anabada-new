import { expect, test } from "bun:test";
import { DatabaseTransactionError } from "../src/infrastructure/errors.js";
import {
  type DatabaseConnection,
  type DatabaseConnectionPool,
  DatabasePool,
  type SqlParameter,
} from "../src/infrastructure/mysql/database-session.js";

test("Given successful work When committing Then releases the connection exactly once", async () => {
  const connection = new RecordingConnection();
  const pool = new DatabasePool(new RecordingPool(connection));

  const result = await pool.unitOfWork(async () => "completed");

  expect(result).toBe("completed");
  expect(connection.beginCalls).toBe(1);
  expect(connection.commitCalls).toBe(1);
  expect(connection.rollbackCalls).toBe(0);
  expect(connection.releaseCalls).toBe(1);
  expect(connection.destroyCalls).toBe(0);
});

test("Given work failure and normal rollback When unit of work ends Then releases once and preserves failure", async () => {
  const connection = new RecordingConnection();
  const pool = new DatabasePool(new RecordingPool(connection));
  const rawFailure = new Error("raw work failure");

  await expect(
    pool.unitOfWork(async () => {
      throw rawFailure;
    }),
  ).rejects.toBe(rawFailure);

  expect(connection.rollbackCalls).toBe(1);
  expect(connection.releaseCalls).toBe(1);
  expect(connection.destroyCalls).toBe(0);
});

test("Given rollback failure When unit of work ends Then destroys without release and exposes typed sanitized error", async () => {
  const connection = new RecordingConnection();
  connection.rollbackFailure = new Error("raw rollback credential");
  const pool = new DatabasePool(new RecordingPool(connection));

  try {
    await pool.unitOfWork(async () => {
      throw new Error("raw work credential");
    });
  } catch (error) {
    expect(error).toBeInstanceOf(DatabaseTransactionError);
    if (error instanceof DatabaseTransactionError) {
      expect(error.message).not.toContain("credential");
      expect(error.operationId).toBeUndefined();
    }
  }

  expect(connection.rollbackCalls).toBe(1);
  expect(connection.destroyCalls).toBe(1);
  expect(connection.releaseCalls).toBe(0);
});

class RecordingPool implements DatabaseConnectionPool {
  constructor(private readonly connection: DatabaseConnection) {}

  async getConnection(): Promise<DatabaseConnection> {
    return this.connection;
  }
}

class RecordingConnection implements DatabaseConnection {
  beginCalls = 0;
  commitCalls = 0;
  rollbackCalls = 0;
  releaseCalls = 0;
  destroyCalls = 0;
  rollbackFailure: Error | undefined;

  async query(_options: {
    readonly sql: string;
    readonly values: readonly SqlParameter[];
    readonly timeout: number;
  }): Promise<readonly [unknown, unknown]> {
    return [[], []];
  }

  async beginTransaction(): Promise<void> {
    this.beginCalls += 1;
  }

  async commit(): Promise<void> {
    this.commitCalls += 1;
  }

  async rollback(): Promise<void> {
    this.rollbackCalls += 1;
    if (this.rollbackFailure) throw this.rollbackFailure;
  }

  release(): void {
    this.releaseCalls += 1;
  }

  destroy(): void {
    this.destroyCalls += 1;
  }
}
