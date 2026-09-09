import type { Connection, RowDataPacket } from "mysql2/promise";
import { createConnection } from "mysql2/promise";

import type { Migration } from "./catalog.js";
import type { MigrationConfiguration } from "./config.js";
import { MigrationError, migrationErrorCodes } from "./errors.js";

type DatabaseRow = Readonly<Record<string, unknown>>;

/** 적용 이력 테이블에서 읽은 마이그레이션 기록이다. */
export type AppliedMigration = Readonly<{
  version: number;
  filename: string;
  checksumSha256: string;
}>;

/** MySQL 연결에 필요한 최소 동작을 정의하는 테스트 경계다. */
export interface MigrationConnection {
  query(
    sql: string,
    parameters?: readonly (number | string)[],
  ): Promise<readonly [readonly DatabaseRow[], unknown]>;
  execute(sql: string, parameters: readonly (number | string)[]): Promise<void>;
  end(): Promise<void>;
}

/** 연결 생성을 주입하는 MySQL 어댑터 경계다. */
export interface MigrationConnectionFactory {
  create(config: MigrationConfiguration): Promise<MigrationConnection>;
}

/** mysql2 연결을 마이그레이터의 최소 연결 계약으로 변환한다. */
export class MysqlMigrationConnectionFactory
  implements MigrationConnectionFactory
{
  public async create(
    config: MigrationConfiguration,
  ): Promise<MigrationConnection> {
    const connection = await createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      multipleStatements: true,
    });
    return new MysqlMigrationConnection(connection);
  }
}

/** 잠금, 상태 테이블, 적용 이력을 MySQL에 저장한다. */
export class MigrationRepository {
  private connection: MigrationConnection | undefined;

  public constructor(
    private readonly config: MigrationConfiguration,
    private readonly connectionFactory: MigrationConnectionFactory,
  ) {}

  public async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const connection = await this.connectionFactory.create(this.config);
    this.connection = connection;
    let lockHeld = false;
    try {
      lockHeld = await this.acquireLock();
      const result = await operation();
      const cleanupError = await this.cleanup(connection, lockHeld);
      this.connection = undefined;
      if (cleanupError !== undefined) {
        throw cleanupError;
      }
      return result;
    } catch (error: unknown) {
      if (this.connection !== undefined) {
        await this.cleanup(connection, lockHeld);
        this.connection = undefined;
      }
      throw error;
    }
  }

  public async databaseExists(): Promise<boolean> {
    const [rows] = await this.requireConnection().query(
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
      [this.config.database],
    );
    return rows.length > 0;
  }

  public async useDatabase(): Promise<void> {
    await this.requireConnection().query(`USE \`${this.config.database}\``);
  }

  public async hasMigrationTable(): Promise<boolean> {
    const [rows] = await this.requireConnection().query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'migrations'",
    );
    return rows.length > 0;
  }

  public async executeSql(sql: string): Promise<void> {
    await this.requireConnection().query(sql);
  }

  public async createMigrationTable(): Promise<void> {
    await this.requireConnection().query(
      "CREATE TABLE migrations (version INT UNSIGNED NOT NULL PRIMARY KEY, filename VARCHAR(255) NOT NULL UNIQUE, checksum_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
    );
  }

  public async readApplied(): Promise<readonly AppliedMigration[]> {
    const [rows] = await this.requireConnection().query(
      "SELECT version, filename, checksum_sha256 FROM migrations ORDER BY version ASC",
    );
    return rows.map((row) => ({
      version: Number(row["version"]),
      filename: String(row["filename"]),
      checksumSha256: String(row["checksum_sha256"]),
    }));
  }

  public async record(migration: Migration): Promise<void> {
    await this.requireConnection().execute(
      "INSERT INTO migrations (version, filename, checksum_sha256) VALUES (?, ?, ?)",
      [migration.version, migration.filename, migration.checksumSha256],
    );
  }

  private async acquireLock(): Promise<boolean> {
    const [rows] = await this.requireConnection().query(
      "SELECT GET_LOCK(?, 60) AS acquired",
      ["jungol_bada:migrations"],
    );
    if (rows[0]?.["acquired"] !== 1) {
      throw new MigrationError(migrationErrorCodes.lockUnavailable);
    }
    return true;
  }

  private async cleanup(
    connection: MigrationConnection,
    lockHeld: boolean,
  ): Promise<unknown | undefined> {
    let cleanupError: unknown | undefined;
    if (lockHeld) {
      try {
        await connection.query("SELECT RELEASE_LOCK(?)", [
          "jungol_bada:migrations",
        ]);
      } catch (error: unknown) {
        cleanupError = error;
      }
    }
    try {
      await connection.end();
    } catch (error: unknown) {
      if (cleanupError === undefined) cleanupError = error;
    }
    return cleanupError;
  }

  private requireConnection(): MigrationConnection {
    if (this.connection === undefined)
      throw new MigrationError(migrationErrorCodes.configurationInvalid);
    return this.connection;
  }
}

class MysqlMigrationConnection implements MigrationConnection {
  public constructor(private readonly connection: Connection) {}

  public async query(
    sql: string,
    parameters?: readonly (number | string)[],
  ): Promise<readonly [readonly DatabaseRow[], unknown]> {
    const [rows, metadata] = await this.connection.query<RowDataPacket[]>(
      sql,
      parameters,
    );
    return [rows, metadata];
  }

  public async execute(
    sql: string,
    parameters: readonly (number | string)[],
  ): Promise<void> {
    await this.connection.execute(sql, parameters);
  }

  public async end(): Promise<void> {
    await this.connection.end();
  }
}
