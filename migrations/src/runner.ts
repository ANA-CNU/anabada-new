import type { Logger } from "pino";

import type { Migration } from "./catalog.js";
import { MigrationError, migrationErrorCodes } from "./errors.js";
import type { AppliedMigration, MigrationRepository } from "./repository.js";

/** 신규 DB 초기화와 순방향 마이그레이션 적용 순서를 조정한다. */
export class MigrationRunner {
  public constructor(
    private readonly repository: MigrationRepository,
    private readonly logger: Logger,
  ) {}

  public async run(migrations: readonly Migration[]): Promise<void> {
    await this.repository.withLock(async () => {
      if (!(await this.repository.databaseExists())) {
        await this.bootstrap(migrations);
        return;
      }
      await this.repository.useDatabase();
      if (!(await this.repository.hasMigrationTable())) {
        throw new MigrationError(migrationErrorCodes.unmanagedDatabase);
      }
      await this.applyPending(migrations);
    });
  }

  private async bootstrap(migrations: readonly Migration[]): Promise<void> {
    const initial = migrations[0];
    if (initial?.version !== 2) {
      throw new MigrationError(migrationErrorCodes.catalogInvalid);
    }
    await this.repository.executeSql(initial.sql);
    await this.repository.useDatabase();
    await this.repository.createMigrationTable();
    await this.repository.record(initial);
    this.logApplied(initial);
    await this.applyPending(migrations);
  }

  private async applyPending(migrations: readonly Migration[]): Promise<void> {
    const pending = selectPending(
      migrations,
      await this.repository.readApplied(),
    );
    for (const migration of pending) {
      await this.repository.executeSql(migration.sql);
      await this.repository.record(migration);
      this.logApplied(migration);
    }
  }

  private logApplied(migration: Migration): void {
    this.logger.info(
      { version: migration.version, filename: migration.filename },
      "migration.applied",
    );
  }
}

function selectPending(
  migrations: readonly Migration[],
  applied: readonly AppliedMigration[],
): readonly Migration[] {
  for (const [index, recorded] of applied.entries()) {
    const migration = migrations[index];
    if (
      migration === undefined ||
      migration.version !== recorded.version ||
      migration.filename !== recorded.filename
    ) {
      throw new MigrationError(migrationErrorCodes.migrationHistoryInvalid);
    }
    if (migration.checksumSha256 !== recorded.checksumSha256) {
      throw new MigrationError(migrationErrorCodes.appliedMigrationModified);
    }
  }
  return migrations.slice(applied.length);
}
