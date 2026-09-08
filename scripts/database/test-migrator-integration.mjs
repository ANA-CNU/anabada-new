import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const id = randomUUID();
const network = `jungol-migrator-${id}`;
const mysql = `mysql-${id}`;
const image = `jungol-migrator-test:${id}`;
const fixture = mkdtempSync(join(tmpdir(), "jungol-migrator-"));
const password = "migrator-test-password";
const migration = readFileSync(join(root, "migrations/002_create_jungol_bada.sql"));
const checksum = createHash("sha256").update(migration).digest("hex");

function docker(args, options = {}) {
  return spawnSync("docker", args, { cwd: root, encoding: "utf8", ...options });
}

function output(args, options = {}) {
  const result = docker(args, options);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function sql(statement) {
  return output([
    "exec", mysql, "mysql", "-uroot", `-p${password}`, "-Nse", statement,
  ]);
}

function runMigrator(extra = []) {
  return docker([
    "run", "--rm", "--network", network, "-e", `DB_PASSWORD=${password}`,
    ...extra, image,
  ]);
}

function runMigratorAsync(extra = []) {
  return new Promise((resolveRun) => {
    const child = spawn("docker", [
      "run", "--rm", "--network", network, "-e", `DB_PASSWORD=${password}`,
      ...extra, image,
    ], { cwd: root, stdio: "ignore" });
    child.once("exit", (code) => resolveRun(code));
  });
}

try {
  output(["build", "-t", image, "-f", "database/migrator/Dockerfile", "."]);
  output(["network", "create", network]);
  output([
    "run", "-d", "--name", mysql, "--network", network,
    "--network-alias", "anabada-mysql", "--tmpfs", "/var/lib/mysql",
    "-e", `MYSQL_ROOT_PASSWORD=${password}`, "mysql:8.4",
  ]);
  const deadline = Date.now() + 90000;
  while (docker(["exec", mysql, "mysqladmin", "--protocol=TCP", "-h127.0.0.1", "-uroot", `-p${password}`, "ping", "--silent"]).status !== 0) {
    if (Date.now() > deadline) throw new Error("Disposable MySQL startup timed out");
  }

  check(runMigrator().status === 0, "fresh migration failed");
  check(sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='jungol_bada'") === "10", "fresh migration did not create nine app tables and migrations");
  check(sql("SELECT version FROM jungol_bada.migrations") === "2", "version 2 was not recorded");
  check(sql("SELECT LENGTH(checksum_sha256) FROM jungol_bada.migrations") === "64", "checksum was not recorded");
  sql("INSERT INTO jungol_bada.user (jungol_name, jungol_account_id) VALUES ('sentinel', 999999)");
  check(runMigrator().status === 0, "second migration was not a no-op");
  check(sql("SELECT COUNT(*) FROM jungol_bada.user WHERE jungol_name='sentinel'") === "1", "no-op migration lost sentinel");

  sql("DROP DATABASE jungol_bada; CREATE DATABASE jungol_bada; CREATE TABLE jungol_bada.value_probe (id INT PRIMARY KEY); INSERT INTO jungol_bada.value_probe VALUES (1)");
  check(runMigrator().status !== 0, "unmanaged database unexpectedly migrated");
  check(sql("SELECT COUNT(*) FROM jungol_bada.value_probe") === "1", "unmanaged database changed");
  sql("DROP DATABASE jungol_bada");
  check(runMigrator().status === 0, "recreating managed database failed");
  sql("INSERT INTO jungol_bada.user (jungol_name, jungol_account_id) VALUES ('sentinel_after_reset', 999998)");
  sql("UPDATE jungol_bada.migrations SET checksum_sha256=REPEAT('0', 64) WHERE version=2");
  check(runMigrator().status !== 0, "checksum mismatch unexpectedly migrated");
  check(sql("SELECT COUNT(*) FROM jungol_bada.user WHERE jungol_name='sentinel_after_reset'") === "1", "checksum failure changed data");
  sql(`UPDATE jungol_bada.migrations SET checksum_sha256='${checksum}' WHERE version=2`);

  cpSync(join(root, "migrations/002_create_jungol_bada.sql"), join(fixture, "002_create_jungol_bada.sql"));
  cpSync(join(root, "scripts/database/test-fixtures/003_fail_after_sentinel.sql"), join(fixture, "003_fail_after_sentinel.sql"));
  check(runMigrator(["-v", `${fixture}:/migrations:ro`]).status !== 0, "failing pending migration unexpectedly succeeded");
  check(sql("SELECT COUNT(*) FROM jungol_bada.migrations WHERE version=3") === "0", "failed migration was recorded");
  check(sql("SELECT COUNT(*) FROM jungol_bada.user WHERE jungol_name='sentinel_after_reset'") === "1", "failed migration lost sentinel");
  writeFileSync(join(fixture, "003_fail_after_sentinel.sql"), "SELECT SLEEP(2); CREATE TABLE lock_probe (id INT PRIMARY KEY);\n");
  const [first, second] = await Promise.all([
    runMigratorAsync(["-v", `${fixture}:/migrations:ro`]),
    runMigratorAsync(["-v", `${fixture}:/migrations:ro`]),
  ]);
  check(first === 0 && second === 0, "concurrent migrators did not serialize");
  check(sql("SELECT COUNT(*) FROM jungol_bada.migrations WHERE version=3") === "1", "concurrent migration was not recorded once");
  check(output(["image", "inspect", image, "--format", "{{.Config.User}}"] ) === "node", "migrator image is not non-root");
  check(docker(["run", "--rm", "--entrypoint", "sh", image, "-ec", "test -z \"$(find /migrations -type f \\( -name '000_*' -o -name '001_*' \\) -print -quit)\""]).status === 0, "migrator image contains legacy SQL");
} finally {
  docker(["rm", "-f", mysql]);
  docker(["network", "rm", network]);
  docker(["image", "rm", "-f", image]);
  rmSync(fixture, { force: true, recursive: true });
}
