/** 마이그레이터가 호출자에게 안전하게 전달하는 실패 코드다. */
export const migrationErrorCodes = {
  appliedMigrationModified: "applied_migration_modified",
  catalogInvalid: "catalog_invalid",
  configurationInvalid: "configuration_invalid",
  lockUnavailable: "lock_unavailable",
  migrationHistoryInvalid: "migration_history_invalid",
  unmanagedDatabase: "unmanaged_database",
} as const;

export type MigrationErrorCode =
  (typeof migrationErrorCodes)[keyof typeof migrationErrorCodes];

/** 안전한 운영 로그와 종료 상태에 쓰이는 마이그레이터 오류다. */
export class MigrationError extends Error {
  public constructor(public readonly code: MigrationErrorCode) {
    super(code);
    this.name = "MigrationError";
  }
}
