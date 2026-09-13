import type { Pool, PoolConnection } from "mysql2/promise";
import type { CycleTrace } from "../application/cycle-diagnostics.js";
import type { KstCalendar } from "../scoring/daily.js";
import { CommitUnknownError } from "./account-types.js";
import { AttemptRepository } from "./attempts.js";
import {
  BiasRepository,
  EventRepository,
  ScoreHistoryRepository,
} from "./awards.js";
import { UserRepository } from "./users.js";

export type AccountRepositories = {
  readonly users: UserRepository;
  readonly attempts: AttemptRepository;
  readonly events: EventRepository;
  readonly scores: ScoreHistoryRepository;
  readonly bias: BiasRepository;
};

/** 사용자 한 명의 모든 쓰기를 같은 connection에서 commit하거나 rollback한다. */
export class AccountUnitOfWork {
  constructor(
    private readonly pool: Pick<Pool, "getConnection">,
    private readonly calendar: KstCalendar,
  ) {}

  async execute<T>(
    operation: (repositories: AccountRepositories) => Promise<T>,
  ): Promise<T> {
    return this.transaction((connection) =>
      operation({
        users: new UserRepository(connection),
        attempts: new AttemptRepository(connection),
        events: new EventRepository(connection),
        scores: new ScoreHistoryRepository(connection),
        bias: new BiasRepository(connection, this.calendar),
      }),
    );
  }

  async executeConnection<T>(
    operation: (connection: PoolConnection) => Promise<T>,
    beforeCommit?: () => void,
    onTransactionActive?: () => void,
    onRollbackFailed?: () => void,
    trace?: CycleTrace,
  ): Promise<T> {
    return this.transaction(
      operation,
      beforeCommit,
      onTransactionActive,
      onRollbackFailed,
      trace,
    );
  }

  /** 준비 단계는 쓰기 transaction을 열지 않고 현재 DB snapshot만 읽는다. */
  async readConnection<T>(
    operation: (connection: PoolConnection) => Promise<T>,
  ): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      return await operation(connection);
    } finally {
      connection.release();
    }
  }

  private async transaction<T>(
    operation: (connection: PoolConnection) => Promise<T>,
    beforeCommit?: () => void,
    onTransactionActive?: () => void,
    onRollbackFailed?: () => void,
    trace?: CycleTrace,
  ): Promise<T> {
    const connection = await (trace
      ? trace.run("db_connection", {}, () => this.pool.getConnection())
      : this.pool.getConnection());
    let destroyed = false;
    let began = false;
    try {
      await this.stage(trace, "session_configure", () =>
        connection.query("SET SESSION innodb_lock_wait_timeout=15"),
      );
      await this.stage(trace, "session_configure", () =>
        connection.query(
          "SET SESSION lock_wait_timeout=15, max_execution_time=30000",
        ),
      );
      await this.stage(trace, "transaction_begin", () =>
        connection.beginTransaction(),
      );
      began = true;
      onTransactionActive?.();
      trace?.transaction("active");
      const result = await operation(connection);
      beforeCommit?.();
      try {
        await this.stage(trace, "transaction_commit", () =>
          connection.commit(),
        );
        trace?.transaction("committed");
      } catch (error) {
        destroyed = true;
        try {
          connection.destroy();
        } catch (destroyError) {
          void destroyError;
        }
        trace?.transaction("commit_unknown");
        throw new CommitUnknownError(error);
      }
      return result;
    } catch (error) {
      if (error instanceof CommitUnknownError || !began) throw error;
      try {
        await this.stage(trace, "transaction_rollback", () =>
          connection.rollback(),
        );
        trace?.transaction("rolled_back");
      } catch (rollbackError) {
        destroyed = true;
        // rollback 실패 connection은 재사용하지 않고 원래 operation 오류를 보존한다.
        try {
          connection.destroy();
        } catch (destroyError) {
          void destroyError;
        }
        onRollbackFailed?.();
        trace?.transaction("rollback_failed");
        void rollbackError;
      }
      throw error;
    } finally {
      if (!destroyed) connection.release();
    }
  }

  private stage<T>(
    trace: CycleTrace | undefined,
    stage: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!trace) return operation();
    return trace
      .run(stage, { operationId: stage }, operation)
      .catch((error) => {
        trace.fail(stage, error, this.sqlContext(stage, error));
        throw error;
      });
  }

  private sqlContext(stage: string, error: unknown) {
    if (typeof error !== "object" || error === null)
      return { operationId: stage };
    const candidate = error as { sqlState?: unknown; errno?: unknown };
    return {
      operationId: stage,
      sqlState:
        typeof candidate.sqlState === "string" &&
        /^[A-Z0-9]{5}$/.test(candidate.sqlState)
          ? candidate.sqlState
          : null,
      errno:
        typeof candidate.errno === "number" &&
        Number.isSafeInteger(candidate.errno)
          ? candidate.errno
          : null,
    };
  }
}
