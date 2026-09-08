import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MigrationCatalog, MigrationCatalogError } from "../src/catalog.js";

async function fixture(
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "jungol-migrator-"));
  await Promise.all(
    Object.entries(files).map(async ([name, content]) =>
      writeFile(join(directory, name), content, "utf8"),
    ),
  );
  return directory;
}

test("Given contiguous active migrations, when loading the catalog, then it orders and checksums them", async () => {
  const directory = await fixture({
    "003_add_index.sql": "SELECT 3;",
    "002_create_jungol_bada.sql": "SELECT 2;",
  });

  const migrations = await new MigrationCatalog(directory).load();

  assert.deepEqual(
    migrations.map((migration) => migration.filename),
    ["002_create_jungol_bada.sql", "003_add_index.sql"],
  );
  assert.equal(
    migrations[0]?.checksumSha256,
    createHash("sha256").update("SELECT 2;", "utf8").digest("hex"),
  );
});

test("Given a catalog below version 002, when loading it, then it rejects the catalog", async () => {
  const directory = await fixture({ "001_legacy.sql": "SELECT 1;" });

  await assert.rejects(
    () => new MigrationCatalog(directory).load(),
    MigrationCatalogError,
  );
});

test("Given an empty active directory, when loading the catalog, then it rejects the catalog", async () => {
  const directory = await fixture({});

  await assert.rejects(
    () => new MigrationCatalog(directory).load(),
    MigrationCatalogError,
  );
});

test("Given a catalog with a version gap, when loading it, then it rejects the catalog", async () => {
  const directory = await fixture({
    "002_create_jungol_bada.sql": "SELECT 2;",
    "004_future.sql": "SELECT 4;",
  });

  await assert.rejects(
    () => new MigrationCatalog(directory).load(),
    MigrationCatalogError,
  );
});

test("Given two active filenames with one version, when loading it, then it rejects duplicates", async () => {
  const directory = await fixture({
    "002_create_jungol_bada.sql": "SELECT 2;",
    "002_other.sql": "SELECT 2;",
  });

  await assert.rejects(
    () => new MigrationCatalog(directory).load(),
    MigrationCatalogError,
  );
});
