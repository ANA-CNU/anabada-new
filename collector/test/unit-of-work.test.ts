import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolConnection } from "mysql2/promise";
import { AccountUnitOfWork } from "../src/mysql/unit-of-work.js";
import { KstCalendar } from "../src/scoring/daily.js";

type FakeConnection = {
  readonly events: string[];
  query(sql: string): Promise<void>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
  destroy(): void;
};

const createUnitOfWork = (
  rollbackError?: Error,
): {
  readonly connection: FakeConnection;
  readonly unitOfWork: AccountUnitOfWork;
} => {
  const events: string[] = [];
  const connection: FakeConnection = {
    events,
    query: async (sql) => {
      events.push(`query:${sql}`);
    },
    beginTransaction: async () => {
      events.push("begin");
    },
    commit: async () => {
      events.push("commit");
    },
    rollback: async () => {
      events.push("rollback");
      if (rollbackError) throw rollbackError;
    },
    release: () => {
      events.push("release");
    },
    destroy: () => {
      events.push("destroy");
    },
  };
  const pool = {
    getConnection: async () => connection as unknown as PoolConnection,
  } satisfies Pick<Pool, "getConnection">;
  return {
    connection,
    unitOfWork: new AccountUnitOfWork(pool, new KstCalendar()),
  };
};

test("Given a successful connection operation When executing it Then both session limits commit and release", async () => {
  const { connection, unitOfWork } = createUnitOfWork();

  const result = await unitOfWork.executeConnection(async () => {
    connection.events.push("operation");
    return "committed";
  });

  assert.equal(result, "committed");
  assert.deepEqual(connection.events, [
    "query:SET SESSION innodb_lock_wait_timeout=15",
    "query:SET SESSION lock_wait_timeout=15, max_execution_time=30000",
    "begin",
    "operation",
    "commit",
    "release",
  ]);
});

test("Given an operation failure When executing it Then rollback releases and preserves the operation error", async () => {
  const { connection, unitOfWork } = createUnitOfWork();
  const operationError = new Error("operation_failed");

  await assert.rejects(
    () =>
      unitOfWork.executeConnection(async () => {
        connection.events.push("operation");
        throw operationError;
      }),
    (error: unknown) => error === operationError,
  );

  assert.deepEqual(connection.events.slice(-3), [
    "operation",
    "rollback",
    "release",
  ]);
});

test("Given rollback failure after an operation failure When executing it Then the connection is destroyed and the operation error survives", async () => {
  const rollbackError = new Error("rollback_failed");
  const { connection, unitOfWork } = createUnitOfWork(rollbackError);
  const operationError = new Error("operation_failed");

  await assert.rejects(
    () =>
      unitOfWork.executeConnection(async () => {
        connection.events.push("operation");
        throw operationError;
      }),
    (error: unknown) => error === operationError,
  );

  assert.deepEqual(connection.events.slice(-3), [
    "operation",
    "rollback",
    "destroy",
  ]);
  assert.equal(connection.events.includes("release"), false);
});
