import { expect, test } from "bun:test";
import { UserConflictError, UserService } from "../src/api/user/User.js";
import {
  DatabaseQueryError,
  DatabaseTransactionError,
} from "../src/infrastructure/errors.js";
import {
  type DatabaseConnection,
  type DatabaseConnectionPool,
  DatabasePool,
  DatabaseSession,
  type SqlParameter,
  sqlOperations,
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

test("Given MySQL duplicate entry When a query fails Then preserves only the allowlisted vendor code", async () => {
  const session = new DatabaseSession(new DuplicateConnection());
  await expect(
    session.execute(
      sqlOperations.userUpdate,
      "UPDATE user SET jungol_name = ?",
      ["name"],
    ),
  ).rejects.toMatchObject({
    name: "DatabaseQueryError",
    code: "database_query_failed",
    vendorCode: "ER_DUP_ENTRY",
    operationId: "user.update",
  });
});

test("Given duplicate user data When updating a user Then exposes a user conflict", async () => {
  const service = new UserService({
    list: async () => [],
    find: async () => undefined,
    search: async () => [],
    update: async () => {
      throw new DatabaseQueryError("user.update", "ER_DUP_ENTRY");
    },
    remove: async () => false,
  });
  await expect(
    service.update(1, { jungol_name: "duplicate" }),
  ).rejects.toBeInstanceOf(UserConflictError);
});

test("Given another database failure When updating a user Then preserves the infrastructure error", async () => {
  const failure = new DatabaseQueryError("user.update");
  const service = new UserService({
    list: async () => [],
    find: async () => undefined,
    search: async () => [],
    update: async () => {
      throw failure;
    },
    remove: async () => false,
  });
  await expect(service.update(1, { jungol_name: "name" })).rejects.toBe(
    failure,
  );
});

class RecordingPool implements DatabaseConnectionPool {
  constructor(private readonly connection: DatabaseConnection) {}

  async getConnection(): Promise<DatabaseConnection> {
    return this.connection;
  }
}

class DuplicateConnection implements DatabaseConnection {
  async query(_options: {
    readonly sql: string;
    readonly values: readonly SqlParameter[];
    readonly timeout: number;
  }): Promise<readonly [unknown, unknown]> {
    throw { code: "ER_DUP_ENTRY", errno: 1062, message: "raw secret" };
  }
  async beginTransaction(): Promise<void> {}
  async commit(): Promise<void> {}
  async rollback(): Promise<void> {}
  release(): void {}
  destroy(): void {}
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
