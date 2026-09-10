import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import {
  DatabaseContractError,
  DatabaseQueryError,
  DatabaseTransactionError,
} from "../errors.js";

declare const operationIdBrand: unique symbol;
export type SqlOperationId = string & {
  readonly [operationIdBrand]: "SqlOperationId";
};
export type SqlOperation = Readonly<{
  readonly id: SqlOperationId;
  readonly timeoutMs: number;
}>;
export interface SqlOperationObserver {
  observe(operationId: SqlOperationId): void;
}
export type SqlParameter =
  | string
  | number
  | bigint
  | boolean
  | Date
  | Uint8Array
  | object
  | null
  | undefined;

/** mysql2 연결에서 세션 경계가 실제로 사용하는 최소 계약으로, 결정론적 테스트 이중도 같은 수명주기를 검증할 수 있게 한다. */
export interface DatabaseConnection {
  query(options: {
    readonly sql: string;
    readonly values: readonly SqlParameter[];
    readonly timeout: number;
  }): Promise<readonly [unknown, unknown]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
  destroy(): void;
}

/** 연결을 획득하는 풀의 최소 계약이다. */
export interface DatabaseConnectionPool {
  getConnection(): Promise<DatabaseConnection>;
}
export const sqlOperations = {
  healthReady: { id: "health.ready" as SqlOperationId, timeoutMs: 1000 },
  healthTables: { id: "health.tables" as SqlOperationId, timeoutMs: 1000 },
  configureUtc: {
    id: "session.configure_utc" as SqlOperationId,
    timeoutMs: 1000,
  },
  eventCreate: { id: "event.create" as SqlOperationId, timeoutMs: 2_000 },
  eventFind: { id: "event.find" as SqlOperationId, timeoutMs: 1_000 },
  eventList: { id: "event.list" as SqlOperationId, timeoutMs: 1_000 },
  eventOngoing: { id: "event.ongoing" as SqlOperationId, timeoutMs: 1_000 },
  eventPast: { id: "event.past" as SqlOperationId, timeoutMs: 1_000 },
  eventLock: { id: "event.lock" as SqlOperationId, timeoutMs: 1_000 },
  eventUpdate: { id: "event.update" as SqlOperationId, timeoutMs: 2_000 },
  eventDelete: { id: "event.delete" as SqlOperationId, timeoutMs: 2_000 },
  eventProblemsList: {
    id: "event_problems.list" as SqlOperationId,
    timeoutMs: 1_000,
  },
  eventProblemsInsert: {
    id: "event_problems.insert" as SqlOperationId,
    timeoutMs: 2_000,
  },
  eventProblemsDelete: {
    id: "event_problems.delete" as SqlOperationId,
    timeoutMs: 2_000,
  },
  userList: { id: "user.list" as SqlOperationId, timeoutMs: 1_000 },
  userFind: { id: "user.find" as SqlOperationId, timeoutMs: 1_000 },
  userSearch: { id: "user.search" as SqlOperationId, timeoutMs: 1_000 },
  userExists: { id: "user.exists" as SqlOperationId, timeoutMs: 1_000 },
  userUpdate: { id: "user.update" as SqlOperationId, timeoutMs: 2_000 },
  healthMigrations: {
    id: "health.migrations" as SqlOperationId,
    timeoutMs: 1_000,
  },
  activityUserProblems: {
    id: "activity.user_problems" as SqlOperationId,
    timeoutMs: 1_000,
  },
  activityRecent: { id: "activity.recent" as SqlOperationId, timeoutMs: 1_000 },
  activityMonthly: {
    id: "activity.monthly" as SqlOperationId,
    timeoutMs: 1_000,
  },
  activityMonthlyStats: {
    id: "activity.monthly_stats" as SqlOperationId,
    timeoutMs: 1_000,
  },
  activityTotal: { id: "activity.total" as SqlOperationId, timeoutMs: 1_000 },
  hookCount: { id: "hook.count" as SqlOperationId, timeoutMs: 1_000 },
  hookList: { id: "hook.list" as SqlOperationId, timeoutMs: 1_000 },
  hookFind: { id: "hook.find" as SqlOperationId, timeoutMs: 1_000 },
  hookCreate: { id: "hook.create" as SqlOperationId, timeoutMs: 2_000 },
  hookUpdate: { id: "hook.update" as SqlOperationId, timeoutMs: 2_000 },
  hookRemove: { id: "hook.remove" as SqlOperationId, timeoutMs: 2_000 },
  hookToggle: { id: "hook.toggle" as SqlOperationId, timeoutMs: 2_000 },
  userRemove: { id: "user.remove" as SqlOperationId, timeoutMs: 2_000 },
  biasLockUsers: { id: "bias.lock_users" as SqlOperationId, timeoutMs: 2_000 },
  biasAggregate: { id: "bias.aggregate" as SqlOperationId, timeoutMs: 2_000 },
  biasInsert: { id: "bias.insert" as SqlOperationId, timeoutMs: 2_000 },
  biasList: { id: "bias.list" as SqlOperationId, timeoutMs: 1_000 },
  monthlyScoreLockUsers: {
    id: "monthly_score.lock_users" as SqlOperationId,
    timeoutMs: 2_000,
  },
  monthlyScoreRefresh: {
    id: "monthly_score.refresh" as SqlOperationId,
    timeoutMs: 2_000,
  },
  scoreHistoryUserExists: {
    id: "score_history.user_exists" as SqlOperationId,
    timeoutMs: 1_000,
  },
  scoreHistoryEventExists: {
    id: "score_history.event_exists" as SqlOperationId,
    timeoutMs: 1_000,
  },
  scoreHistoryProblemOwner: {
    id: "score_history.problem_owner" as SqlOperationId,
    timeoutMs: 1_000,
  },
  scoreHistoryEventProblem: {
    id: "score_history.event_problem" as SqlOperationId,
    timeoutMs: 1_000,
  },
  scoreHistoryInsert: {
    id: "score_history.insert" as SqlOperationId,
    timeoutMs: 2_000,
  },
  scoreHistoryCount: {
    id: "score_history.count" as SqlOperationId,
    timeoutMs: 1_000,
  },
  scoreHistoryList: {
    id: "score_history.list" as SqlOperationId,
    timeoutMs: 1_000,
  },
  scoreHistoryUpdate: {
    id: "score_history.update" as SqlOperationId,
    timeoutMs: 2_000,
  },
  scoreHistoryRemove: {
    id: "score_history.remove" as SqlOperationId,
    timeoutMs: 2_000,
  },
  scoreHistoryOwner: {
    id: "score_history.owner" as SqlOperationId,
    timeoutMs: 1_000,
  },
  rankingSolvedMonth: {
    id: "ranking.solved_month" as SqlOperationId,
    timeoutMs: 1_000,
  },
  rankingMonthlySolved: {
    id: "ranking.monthly_solved" as SqlOperationId,
    timeoutMs: 1_000,
  },
  rankingBias: { id: "ranking.bias" as SqlOperationId, timeoutMs: 1_000 },
  rankingBiasV2: { id: "ranking.bias_v2" as SqlOperationId, timeoutMs: 1_000 },
  rankingBoardLatest: {
    id: "ranking.board_latest" as SqlOperationId,
    timeoutMs: 1_000,
  },
  rankingBoardLatestDate: {
    id: "ranking.board_latest_date" as SqlOperationId,
    timeoutMs: 1_000,
  },
  rankingTopGainers: {
    id: "ranking.top_gainers" as SqlOperationId,
    timeoutMs: 1_000,
  },
  rankingUserRankHistory: {
    id: "ranking.user_rank_history" as SqlOperationId,
    timeoutMs: 1_000,
  },
  rankingSelectedMonth: {
    id: "ranking.selected_month" as SqlOperationId,
    timeoutMs: 1_000,
  },
  rankingRecentScore: {
    id: "ranking.recent_score" as SqlOperationId,
    timeoutMs: 1_000,
  },
  rankingRecentScoreTop: {
    id: "ranking.recent_score_top" as SqlOperationId,
    timeoutMs: 1_000,
  },
  rankingUserScoreHistory: {
    id: "ranking.user_score_history" as SqlOperationId,
    timeoutMs: 1_000,
  },
  adminRankingBoardsList: {
    id: "admin.ranking_boards.list" as SqlOperationId,
    timeoutMs: 1_000,
  },
  adminRankingBoardsCount: {
    id: "admin.ranking_boards.count" as SqlOperationId,
    timeoutMs: 1_000,
  },
  adminRankingBoardsFind: {
    id: "admin.ranking_boards.find" as SqlOperationId,
    timeoutMs: 1_000,
  },
  adminRankingBoardsMembers: {
    id: "admin.ranking_boards.members" as SqlOperationId,
    timeoutMs: 1_000,
  },
  adminRankingBoardsLock: {
    id: "admin.ranking_boards.lock" as SqlOperationId,
    timeoutMs: 1_000,
  },
  adminRankingBoardsDeactivateAll: {
    id: "admin.ranking_boards.deactivate_all" as SqlOperationId,
    timeoutMs: 2_000,
  },
  adminRankingBoardsSetActive: {
    id: "admin.ranking_boards.set_active" as SqlOperationId,
    timeoutMs: 2_000,
  },
} as const satisfies Record<string, SqlOperation>;
const registeredSqlOperationIds = Object.values(sqlOperations).map(
  (operation) => operation.id,
);
export const allSqlOperationIds = new Set<SqlOperationId>(
  registeredSqlOperationIds,
);
export const allSqlOperationKeys = Object.keys(sqlOperations);
if (allSqlOperationIds.size !== registeredSqlOperationIds.length)
  throw new Error("SQL operation IDs must be unique");
const rowArraySchema = z.array(z.object({}).passthrough());
const resultHeaderSchema = z
  .object({ affectedRows: z.number(), insertId: z.number() })
  .passthrough();

export interface DatabaseExecutor {
  select<T>(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<readonly T[]>;
  selectOne<T>(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T | undefined>;
  execute(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
  ): Promise<Readonly<z.infer<typeof resultHeaderSchema>>>;
}

/** UTC 세션과 제한 시간을 강제해 호출자가 연결 수명·결과 검증을 잊지 않게 하는 DB 경계다. */
export class DatabaseSession implements DatabaseExecutor {
  private destroyed = false;
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly observer?: SqlOperationObserver,
  ) {}
  async initialize(): Promise<void> {
    await this.run(sqlOperations.configureUtc, "SET time_zone = '+00:00'", []);
  }
  async select<T>(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<readonly T[]> {
    const rows = await this.run(operation, sql, values);
    if (!rowArraySchema.safeParse(rows).success)
      throw new DatabaseContractError(operation.id);
    const parsed = z.array(schema).safeParse(rows);
    if (!parsed.success) throw new DatabaseContractError(operation.id);
    return parsed.data;
  }
  async selectOne<T>(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T | undefined> {
    const rows = await this.select(operation, sql, values, schema);
    return rows[0];
  }
  async execute(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
  ): Promise<Readonly<z.infer<typeof resultHeaderSchema>>> {
    const result = await this.run(operation, sql, values);
    const parsed = resultHeaderSchema.safeParse(result);
    if (!parsed.success) throw new DatabaseContractError(operation.id);
    return parsed.data;
  }
  async commit(): Promise<void> {
    try {
      await this.connection.commit();
    } catch {
      throw new DatabaseTransactionError();
    }
  }
  async rollback(): Promise<void> {
    try {
      await this.connection.rollback();
    } catch {
      this.connection.destroy();
      this.destroyed = true;
      throw new DatabaseTransactionError();
    }
  }
  async begin(): Promise<void> {
    try {
      await this.connection.beginTransaction();
    } catch {
      throw new DatabaseTransactionError();
    }
  }
  release(): void {
    if (!this.destroyed) this.connection.release();
  }
  private async run(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
  ): Promise<unknown> {
    try {
      this.observer?.observe(operation.id);
      const [result] = await this.connection.query({
        sql,
        values: [...values],
        timeout: operation.timeoutMs,
      });
      return result;
    } catch (error) {
      const vendorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ER_DUP_ENTRY"
          ? "ER_DUP_ENTRY"
          : undefined;
      throw new DatabaseQueryError(operation.id, vendorCode);
    }
  }
}

/** 풀 획득과 트랜잭션 종료를 한 곳에 모아 connection leak과 미완료 rollback을 방지한다. */
export class DatabasePool {
  constructor(
    private readonly pool: DatabaseConnectionPool,
    private readonly observer?: SqlOperationObserver,
  ) {}
  async session(): Promise<DatabaseSession> {
    const connection = await this.pool.getConnection();
    const session = new DatabaseSession(connection, this.observer);
    try {
      await session.initialize();
      return session;
    } catch (error) {
      connection.destroy();
      throw error;
    }
  }
  async unitOfWork<T>(
    work: (session: DatabaseSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.session();
    try {
      await session.begin();
      const result = await work(session);
      await session.commit();
      return result;
    } catch (error) {
      try {
        await session.rollback();
      } catch (rollbackError) {
        if (
          error instanceof DatabaseTransactionError &&
          rollbackError instanceof DatabaseTransactionError
        )
          throw new DatabaseTransactionError(undefined, 2);
        throw rollbackError;
      }
      throw error;
    } finally {
      session.release();
    }
  }
  async withSession<T>(
    work: (session: DatabaseSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.session();
    try {
      return await work(session);
    } finally {
      session.release();
    }
  }
}
export type MysqlRow = RowDataPacket;
