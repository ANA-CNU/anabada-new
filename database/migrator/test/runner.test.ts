import assert from "node:assert/strict";
import test from "node:test";

import { pino } from "pino";

import type { Migration } from "../src/catalog.js";
import type { MigrationConfiguration } from "../src/config.js";
import { MigrationError, migrationErrorCodes } from "../src/errors.js";
import type { MigrationConnection } from "../src/repository.js";
import { MigrationRepository } from "../src/repository.js";
import { MigrationRunner } from "../src/runner.js";

const configuration: MigrationConfiguration = {
  host: "anabada-mysql",
  port: 3306,
  user: "root",
  database: "jungol_bada",
  password: "fixture",
};

const migrations: readonly Migration[] = [
  {
    version: 2,
    filename: "002_create_jungol_bada.sql",
    checksumSha256: "a".repeat(64),
    sql: "SQL_002",
  },
  {
    version: 3,
    filename: "003_next.sql",
    checksumSha256: "b".repeat(64),
    sql: "SQL_003",
  },
  {
    version: 4,
    filename: "004_last.sql",
    checksumSha256: "c".repeat(64),
    sql: "SQL_004",
  },
];

class HistoryConnection implements MigrationConnection {
  public readonly executedSql: string[] = [];

  public constructor(
    private readonly history: readonly Readonly<Record<string, unknown>>[],
  ) {}

  public async query(
    sql: string,
  ): Promise<readonly [readonly Readonly<Record<string, unknown>>[], unknown]> {
    if (sql.startsWith("SELECT GET_LOCK"))
      return [[{ acquired: 1 }], undefined];
    if (sql.startsWith("SELECT SCHEMA_NAME"))
      return [[{ SCHEMA_NAME: "jungol_bada" }], undefined];
    if (sql.startsWith("SELECT TABLE_NAME"))
      return [[{ TABLE_NAME: "migrations" }], undefined];
    if (sql.startsWith("SELECT version")) return [this.history, undefined];
    if (sql.startsWith("SELECT RELEASE_LOCK"))
      return [[{ released: 1 }], undefined];
    if (sql.startsWith("SQL_")) this.executedSql.push(sql);
    return [[], undefined];
  }

  public async execute(): Promise<void> {}

  public async end(): Promise<void> {}
}

function runner(connection: HistoryConnection): MigrationRunner {
  const repository = new MigrationRepository(configuration, {
    create: async () => connection,
  });
  return new MigrationRunner(repository, pino({ enabled: false }));
}

for (const [name, history] of [
  [
    "only 003",
    [{ version: 3, filename: "003_next.sql", checksum_sha256: "b".repeat(64) }],
  ],
  [
    "002 and 004",
    [
      {
        version: 2,
        filename: "002_create_jungol_bada.sql",
        checksum_sha256: "a".repeat(64),
      },
      { version: 4, filename: "004_last.sql", checksum_sha256: "c".repeat(64) },
    ],
  ],
  [
    "out of order",
    [
      { version: 3, filename: "003_next.sql", checksum_sha256: "b".repeat(64) },
      {
        version: 2,
        filename: "002_create_jungol_bada.sql",
        checksum_sha256: "a".repeat(64),
      },
    ],
  ],
  [
    "filename mismatch",
    [
      {
        version: 2,
        filename: "002_renamed.sql",
        checksum_sha256: "a".repeat(64),
      },
    ],
  ],
] as const) {
  test(`Given ${name} applied history, when running, then it fails before executing SQL`, async () => {
    const connection = new HistoryConnection(history);

    await assert.rejects(
      () => runner(connection).run(migrations),
      (error: unknown) =>
        error instanceof MigrationError &&
        error.code === migrationErrorCodes.migrationHistoryInvalid,
    );

    assert.deepEqual(connection.executedSql, []);
  });
}

test("Given checksum-only drift, when running, then it reports applied migration modified before executing SQL", async () => {
  const connection = new HistoryConnection([
    {
      version: 2,
      filename: "002_create_jungol_bada.sql",
      checksum_sha256: "z".repeat(64),
    },
  ]);

  await assert.rejects(
    () => runner(connection).run(migrations),
    (error: unknown) =>
      error instanceof MigrationError &&
      error.code === migrationErrorCodes.appliedMigrationModified,
  );

  assert.deepEqual(connection.executedSql, []);
});

test("Given 002 applied, when running, then it executes 003 and 004 in order", async () => {
  const connection = new HistoryConnection([
    {
      version: 2,
      filename: "002_create_jungol_bada.sql",
      checksum_sha256: "a".repeat(64),
    },
  ]);

  await runner(connection).run(migrations);

  assert.deepEqual(connection.executedSql, ["SQL_003", "SQL_004"]);
});
