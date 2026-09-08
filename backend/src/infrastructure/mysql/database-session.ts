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
  configureUtc: {
    id: "session.configure_utc" as SqlOperationId,
    timeoutMs: 1000,
  },
} as const satisfies Record<string, SqlOperation>;
const rowArraySchema = z.array(z.object({}).passthrough());
const resultHeaderSchema = z
  .object({ affectedRows: z.number(), insertId: z.number() })
  .passthrough();

export interface DatabaseExecutor {
  select<T>(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
    schema: z.ZodType<T>,
  ): Promise<readonly T[]>;
  selectOne<T>(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
    schema: z.ZodType<T>,
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
  constructor(private readonly connection: DatabaseConnection) {}
  async initialize(): Promise<void> {
    await this.run(sqlOperations.configureUtc, "SET time_zone = '+00:00'", []);
  }
  async select<T>(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
    schema: z.ZodType<T>,
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
    schema: z.ZodType<T>,
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
      const [result] = await this.connection.query({
        sql,
        values: [...values],
        timeout: operation.timeoutMs,
      });
      return result;
    } catch {
      throw new DatabaseQueryError(operation.id);
    }
  }
}

/** 풀 획득과 트랜잭션 종료를 한 곳에 모아 connection leak과 미완료 rollback을 방지한다. */
export class DatabasePool {
  constructor(private readonly pool: DatabaseConnectionPool) {}
  async session(): Promise<DatabaseSession> {
    const connection = await this.pool.getConnection();
    const session = new DatabaseSession(connection);
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
}
export type MysqlRow = RowDataPacket;
