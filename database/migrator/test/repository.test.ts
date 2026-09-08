import assert from "node:assert/strict";
import test from "node:test";

import type { MigrationConfiguration } from "../src/config.js";
import { MigrationError, migrationErrorCodes } from "../src/errors.js";
import type { MigrationConnection } from "../src/repository.js";
import { MigrationRepository } from "../src/repository.js";

const configuration: MigrationConfiguration = {
  host: "anabada-mysql",
  port: 3306,
  user: "root",
  database: "jungol_bada",
  password: "fixture",
};

class FakeConnection implements MigrationConnection {
  public endCount = 0;
  public releaseCount = 0;

  public constructor(private readonly releaseFails = false) {}

  public async query(
    sql: string,
  ): Promise<readonly [readonly Readonly<Record<string, unknown>>[], unknown]> {
    if (sql.startsWith("SELECT GET_LOCK"))
      return [[{ acquired: 1 }], undefined];
    if (sql.startsWith("SELECT RELEASE_LOCK")) {
      this.releaseCount += 1;
      if (this.releaseFails) throw new Error("release failed");
      return [[{ released: 1 }], undefined];
    }
    return [[], undefined];
  }

  public async execute(): Promise<void> {}

  public async end(): Promise<void> {
    this.endCount += 1;
    if (this.endCount > 1) throw new Error("connection ended twice");
  }
}

test("Given a locked repository and a failing migration, when it cleans up, then it closes the connection once without masking the failure", async () => {
  const connection = new FakeConnection();
  const repository = new MigrationRepository(configuration, {
    create: async () => connection,
  });

  await assert.rejects(
    () =>
      repository.withLock(async () => {
        throw new MigrationError(migrationErrorCodes.unmanagedDatabase);
      }),
    MigrationError,
  );

  assert.equal(connection.releaseCount, 1);
  assert.equal(connection.endCount, 1);
});

test("Given a release failure after a migration failure, when it cleans up, then it preserves the migration error and closes once", async () => {
  const connection = new FakeConnection(true);
  const repository = new MigrationRepository(configuration, {
    create: async () => connection,
  });

  await assert.rejects(
    () =>
      repository.withLock(async () => {
        throw new MigrationError(migrationErrorCodes.unmanagedDatabase);
      }),
    (error: unknown) =>
      error instanceof MigrationError &&
      error.code === migrationErrorCodes.unmanagedDatabase,
  );

  assert.equal(connection.releaseCount, 1);
  assert.equal(connection.endCount, 1);
});
