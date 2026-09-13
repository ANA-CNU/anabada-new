import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolConnection } from "mysql2/promise";
import { CycleTrace } from "../src/application/cycle-diagnostics.js";
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
  behavior: Partial<{
    getConnectionError: Error;
    queryError: Error;
    beginError: Error;
    commitError: Error;
    destroyError: Error;
  }> = {},
): {
  readonly connection: FakeConnection;
  readonly unitOfWork: AccountUnitOfWork;
} => {
  const events: string[] = [];
  const connection: FakeConnection = {
    events,
    query: async (sql) => {
      events.push(`query:${sql}`);
      if (behavior.queryError) throw behavior.queryError;
    },
    beginTransaction: async () => {
      events.push("begin");
      if (behavior.beginError) throw behavior.beginError;
    },
    commit: async () => {
      events.push("commit");
      if (behavior.commitError) throw behavior.commitError;
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
      if (behavior.destroyError) throw behavior.destroyError;
    },
  };
  const pool = {
    getConnection: async () => {
      if (behavior.getConnectionError) throw behavior.getConnectionError;
      return connection as unknown as PoolConnection;
    },
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

test("Given traced transaction boundaries When each DB lifecycle outcome occurs Then status and first failure are exact", async () => {
  const success = createUnitOfWork();
  const successTrace = new CycleTrace("success");
  await success.unitOfWork.executeConnection(
    async () => {},
    undefined,
    undefined,
    undefined,
    successTrace,
  );
  assert.equal(successTrace.snapshot().transactionStatus, "committed");

  const setup = createUnitOfWork(undefined, { queryError: new Error("setup") });
  const setupTrace = new CycleTrace("setup");
  await assert.rejects(() =>
    setup.unitOfWork.executeConnection(
      async () => {},
      undefined,
      undefined,
      undefined,
      setupTrace,
    ),
  );
  assert.equal(setupTrace.snapshot().transactionStatus, "not_started");
  assert.equal(setupTrace.snapshot().firstFailure?.stage, "session_configure");

  const rollback = createUnitOfWork(new Error("rollback"));
  const rollbackTrace = new CycleTrace("rollback");
  await assert.rejects(() =>
    rollback.unitOfWork.executeConnection(
      async () => {
        await rollbackTrace.run("daily_score", {}, async () => {
          throw new Error("operation");
        });
      },
      undefined,
      undefined,
      undefined,
      rollbackTrace,
    ),
  );
  assert.equal(rollbackTrace.snapshot().transactionStatus, "rollback_failed");
  assert.equal(rollbackTrace.snapshot().firstFailure?.stage, "daily_score");

  const unknown = createUnitOfWork(undefined, {
    commitError: new Error("lost"),
  });
  const unknownTrace = new CycleTrace("unknown");
  await assert.rejects(() =>
    unknown.unitOfWork.executeConnection(
      async () => {},
      undefined,
      undefined,
      undefined,
      unknownTrace,
    ),
  );
  assert.equal(unknownTrace.snapshot().transactionStatus, "commit_unknown");
});

test("Given connection setup failure When executing Then it does not begin or rollback", async () => {
  const setupError = new Error("setup_failed");
  const { connection, unitOfWork } = createUnitOfWork(undefined, {
    queryError: setupError,
  });
  await assert.rejects(
    () => unitOfWork.executeConnection(async () => {}),
    setupError,
  );
  assert.deepEqual(connection.events, [
    "query:SET SESSION innodb_lock_wait_timeout=15",
    "release",
  ]);
});

test("Given connection acquisition failure When executing Then no connection method is called", async () => {
  const connectionError = new Error("connect_failed");
  const { connection, unitOfWork } = createUnitOfWork(undefined, {
    getConnectionError: connectionError,
  });
  await assert.rejects(
    () => unitOfWork.executeConnection(async () => {}),
    connectionError,
  );
  assert.deepEqual(connection.events, []);
});

test("Given begin failure When executing Then it does not rollback", async () => {
  const beginError = new Error("begin_failed");
  const { connection, unitOfWork } = createUnitOfWork(undefined, {
    beginError,
  });
  await assert.rejects(
    () => unitOfWork.executeConnection(async () => {}),
    beginError,
  );
  assert.equal(connection.events.includes("rollback"), false);
  assert.equal(connection.events.at(-1), "release");
});

test("Given commit response failure When cleanup destroy fails Then commit unknown preserves its cause", async () => {
  const commitError = new Error("commit_response_lost");
  const { connection, unitOfWork } = createUnitOfWork(undefined, {
    commitError,
    destroyError: new Error("destroy_failed"),
  });
  await assert.rejects(
    () => unitOfWork.executeConnection(async () => {}),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "CommitUnknownError" &&
      "cause" in error &&
      error.cause === commitError,
  );
  assert.equal(connection.events.includes("rollback"), false);
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
