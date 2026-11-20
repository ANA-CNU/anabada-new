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

  public async run(
    migrations: readonly Migration[],
    requireBojImport = false,
  ): Promise<void> {
    await this.repository.withLock(async () => {
      if (!(await this.repository.databaseExists())) {
        await this.bootstrap(migrations);
      } else {
        await this.repository.useDatabase();
        if (!(await this.repository.hasMigrationTable())) {
          throw new MigrationError(migrationErrorCodes.unmanagedDatabase);
        }
        await this.applyPending(migrations);
      }
      if (requireBojImport && !(await this.repository.hasAppliedBojImport())) {
        throw new MigrationError(migrationErrorCodes.bojSourceUnavailable);
      }
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
      if (migration.filename === "007_import_anabada.sql") {
        if (!(await this.applyBojImport(migration))) return;
      } else {
        // Until the deployment stops the old backend, prevent writes between copying and dropping its tables.
        if (migration.filename === "012_simplify_boj_ingestion.sql")
          await this.repository.lockBojWorkers();
        await this.repository.executeSql(migration.sql);
      }
      await this.repository.record(migration);
      this.logApplied(migration);
    }
  }

  private async applyBojImport(migration: Migration): Promise<boolean> {
    // The import marker commits with the copied rows, so a retry can restore the ledger entry.
    if (await this.repository.hasBojImportMarker()) return true;
    if (!(await this.repository.hasBojSource())) {
      this.logger.warn(
        { filename: migration.filename },
        "migration.boj_source_unavailable",
      );
      return false;
    }
    await this.repository.executeSql(migration.sql);
    if (!(await this.repository.hasBojImportMarker())) {
      throw new MigrationError(migrationErrorCodes.migrationHistoryInvalid);
    }
    return true;
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
