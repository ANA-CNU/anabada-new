import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { MigrationError, migrationErrorCodes } from "./errors.js";

const migrationFilename = /^(\d{3})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

/** 실행 가능한 SQL 파일의 검증된 메타데이터다. */
export type Migration = Readonly<{
  version: number;
  filename: string;
  checksumSha256: string;
  sql: string;
}>;

/** 활성 마이그레이션 디렉터리가 규칙을 위반했을 때 발생한다. */
export class MigrationCatalogError extends MigrationError {
  public constructor() {
    super(migrationErrorCodes.catalogInvalid);
    this.name = "MigrationCatalogError";
  }
}

/** 활성 SQL 카탈로그를 읽고 실행 순서를 검증한다. */
export class MigrationCatalog {
  public constructor(private readonly directory: string) {}

  public async load(): Promise<readonly Migration[]> {
    const entries = await readdir(this.directory, { withFileTypes: true });
    const filenames = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name);
    const migrations = await Promise.all(
      filenames.map((filename) => this.loadMigration(filename)),
    );
    migrations.sort((left, right) => left.version - right.version);
    verifyContinuity(migrations);
    return migrations;
  }

  private async loadMigration(filename: string): Promise<Migration> {
    const match = migrationFilename.exec(filename);
    if (match?.[1] === undefined) {
      throw new MigrationCatalogError();
    }
    const sql = await readFile(join(this.directory, filename), "utf8");
    return {
      version: Number.parseInt(match[1], 10),
      filename,
      checksumSha256: createHash("sha256").update(sql, "utf8").digest("hex"),
      sql,
    };
  }
}

function verifyContinuity(migrations: readonly Migration[]): void {
  if (migrations.length === 0) {
    throw new MigrationCatalogError();
  }
  for (const [index, migration] of migrations.entries()) {
    if (migration === undefined || migration.version !== index + 2) {
      throw new MigrationCatalogError();
    }
  }
}
