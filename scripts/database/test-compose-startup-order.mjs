import { createHash, randomUUID } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const fixture = "scripts/database/test-fixtures/compose-startup-order.yaml";
const project = `jungol-startup-${randomUUID().replaceAll("-", "")}`;
const context = mkdtempSync(join(tmpdir(), "jungol-compose-context-"));
const unreadableSibling = join(context, "database", "mysql_data", "#innodb_redo");
const password = `compose-startup-test-${randomUUID()}`;
const base = ["compose", "--project-name", project, "--env-file", "/dev/null", "-f", fixture];
const env = {
  ...process.env,
  DB_PASSWORD: password,
  MYSQL_PWD: password,
  MIGRATOR_CONTEXT: join(context, "migrations"),
};

function docker(args, options = {}) {
  return spawnSync("docker", args, { cwd: root, encoding: "utf8", env, ...options });
}
function run(args, message) {
  const result = docker(args);
  if (result.status !== 0) throw new Error(`${message}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function check(condition, message) { if (!condition) throw new Error(message); }
function inspect(service) {
  const listed = JSON.parse(run([...base, "ps", "--all", "--format", "json", service], `inspect ${service}`));
  const container = Array.isArray(listed) ? listed[0] : listed;
  check(container?.ID, `missing ${service} container`);
  return JSON.parse(run(["inspect", container.ID], `inspect ${service} state`))[0];
}
function sql(statement) {
  return run([...base, "exec", "-T", "-e", "MYSQL_PWD", "anabada-mysql", "mysql", "-uroot", "-Nse", statement], "SQL assertion");
}
function bounded(value, limit = 4096) {
  return value.replaceAll(password, "[REDACTED]").slice(-limit);
}
function containerDiagnostic(service) {
  const container = docker([...base, "ps", "--all", "-q", service]);
  const id = container.stdout.trim();
  if (container.status !== 0 || id === "") return null;
  const inspected = docker([
    "inspect",
    "--format",
    "{{.Id}}\t{{.Image}}\t{{.Config.Image}}\t{{.State.Status}}\t{{.State.ExitCode}}\t{{.State.StartedAt}}\t{{.State.FinishedAt}}",
    id,
  ]);
  if (inspected.status !== 0) return null;
  const [containerId, image, imageTag, status, exitCode, startedAt, finishedAt] = inspected.stdout.trim().split("\t");
  return { containerId, image, imageTag, status, exitCode, startedAt, finishedAt };
}
function commandDiagnostic(args) {
  const result = docker(args);
  return {
    status: result.status,
    output: bounded(`${result.stdout}${result.stderr}`),
  };
}
function sourceMigrationInputs() {
  return readdirSync(join(context, "migrations"))
    .filter((filename) => filename.endsWith(".sql"))
    .sort()
    .map((filename) => ({
      filename,
      sha256: createHash("sha256").update(readFileSync(join(context, "migrations", filename))).digest("hex"),
    }));
}
function resolvedMigratorBuildContext() {
  const config = docker([...base, "config", "--format", "json"]);
  if (config.status !== 0) return null;
  try {
    return JSON.parse(config.stdout).services?.["jungol-migrator"]?.build?.context ?? null;
  } catch {
    return null;
  }
}
function taggedImageDiagnostic(tag) {
  if (tag === undefined || tag === "") return null;
  const id = docker(["image", "inspect", "--format", "{{.Id}}", tag]);
  return {
    tag,
    imageId: id.status === 0 ? id.stdout.trim() : null,
    migrations: commandDiagnostic(["run", "--rm", "--network", "none", "--entrypoint", "sh", tag, "-ec", "find /app -maxdepth 1 -type f -name '*.sql' -exec basename {} \\; | sort"]),
  };
}
function startupDiagnostics() {
  const migrator = containerDiagnostic("jungol-migrator");
  const pendingProbe = containerDiagnostic("pending-probe");
  const composeVersion = docker(["compose", "version", "--short"]).stdout.trim();
  const imageMigrations = migrator === null
    ? null
    : commandDiagnostic(["run", "--rm", "--network", "none", "--entrypoint", "sh", migrator.image, "-ec", "find /app -maxdepth 1 -type f -name '*.sql' -exec basename {} \\; | sort"]);
  const ledger = docker([...base, "exec", "-T", "-e", "MYSQL_PWD", "anabada-mysql", "mysql", "-uroot", "-Nse", "SELECT version FROM jungol_bada.migrations ORDER BY version"]);
  const logs = Object.fromEntries(
    ["jungol-migrator", "pending-probe"].map((service) => [
      service,
      commandDiagnostic([...base, "logs", "--no-color", "--tail", "100", service]),
    ]),
  );
  return {
    composeVersion,
    engineVersion: docker(["version", "--format", "{{.Server.Version}}"]).stdout.trim(),
    buildxVersion: docker(["buildx", "version"]).stdout.trim(),
    dockerContext: docker(["context", "show"]).stdout.trim(),
    resolvedMigratorBuildContext: resolvedMigratorBuildContext(),
    sourceMigrations: sourceMigrationInputs(),
    migrator,
    pendingProbe,
    imageMigrations,
    taggedMigratorImage: migrator === null ? null : taggedImageDiagnostic(migrator.imageTag),
    ledgerVersions: ledger.status === 0 ? bounded(ledger.stdout) : null,
    logs,
  };
}
function reportStartupDiagnostics() {
  try {
    console.error(JSON.stringify(startupDiagnostics()));
  } catch {
    console.error("startup diagnostics unavailable");
  }
}
function timestamp(value) { return Date.parse(value); }
function copy(source, target) {
  cpSync(join(root, source), join(context, target), { recursive: true });
}
function addMigration(name, contents) {
  writeFileSync(join(context, "migrations", name), contents);
}

try {
  console.log(JSON.stringify({
    composeVersion: docker(["compose", "version", "--short"]).stdout.trim(),
    engineVersion: docker(["version", "--format", "{{.Server.Version}}"]).stdout.trim(),
    buildxVersion: docker(["buildx", "version"]).stdout.trim(),
    dockerContext: docker(["context", "show"]).stdout.trim(),
  }));
  mkdirSync(join(context, "migrations"), { recursive: true });
  for (const file of ["Dockerfile", "Dockerfile.dockerignore", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.build.json"]) {
    copy(`migrations/${file}`, `migrations/${file}`);
  }
  copy("migrations/src", "migrations/src");
  copy("migrations/002_create_jungol_bada.sql", "migrations/002_create_jungol_bada.sql");
  mkdirSync(unreadableSibling, { recursive: true });
  chmodSync(unreadableSibling, 0o000);
  run([...base, "up", "-d", "--build"], "fresh Compose startup");
  const migrator = inspect("jungol-migrator");
  check(migrator.State.Status === "exited" && migrator.State.ExitCode === 0, "migrator did not exit successfully");
  check(migrator.State.Restarting === false, "migrator entered a restart loop");
  for (const service of ["frontend-probe", "middleware-probe", "backend-probe", "collector-probe"]) {
    const probe = inspect(service);
    check(probe.State.Status === "running", `${service} did not start`);
    check(timestamp(probe.State.StartedAt) >= timestamp(migrator.State.FinishedAt), `${service} started before migration completed`);
  }
  check(sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='jungol_bada'") === "10", "fresh migration did not create ten tables");
  check(sql("SELECT version FROM jungol_bada.migrations") === "2", "fresh migration did not record version 2");
  sql("INSERT INTO jungol_bada.user (jungol_name, jungol_account_id) VALUES ('compose_sentinel', 700001)");
  run([...base, "up", "-d", "--build", "--wait", "--wait-timeout", "90"], "no-op Compose startup with --wait");
  check(sql("SELECT COUNT(*) FROM jungol_bada.user WHERE jungol_name='compose_sentinel'") === "1", "no-op startup lost sentinel");

  addMigration("003_pending_probe.sql", "CREATE TABLE pending_probe (id INT PRIMARY KEY);\n");
  try {
    run([...base, "--progress", "plain", "--profile", "pending", "up", "-d", "--build", "--wait", "--wait-timeout", "90"], "pending migration and new probe startup");
  } catch (error) {
    reportStartupDiagnostics();
    throw error;
  }
  const pendingMigrator = inspect("jungol-migrator");
  const pendingProbe = inspect("pending-probe");
  check(pendingMigrator.Id !== migrator.Id, "pending migration did not recreate migrator container");
  check(pendingMigrator.Image !== migrator.Image, "pending migration did not rebuild migrator image");
  check(pendingMigrator.State.ExitCode === 0 && pendingProbe.State.Status === "running", "pending migration did not precede new probe");
  check(timestamp(pendingProbe.State.StartedAt) >= timestamp(pendingMigrator.State.FinishedAt), "new probe started before pending migration completed");
  check(sql("SELECT version FROM jungol_bada.migrations ORDER BY version DESC LIMIT 1") === "3", "pending migration was not recorded");

  addMigration("004_failure_probe.sql", "CREATE TABLE migration_failure_probe (id INT PRIMARY KEY);\nSELECT * FROM missing_failure_probe;\n");
  const failed = docker([...base, "--profile", "failing", "up", "-d", "--build", "--wait", "--wait-timeout", "90"]);
  check(failed.status !== 0, "failing migration made Compose startup succeed");
  const failedMigrator = inspect("jungol-migrator");
  check(failedMigrator.Id !== pendingMigrator.Id, "failing migration did not recreate migrator container");
  check(failedMigrator.Image !== pendingMigrator.Image, "failing migration did not rebuild migrator image");
  const failingProbe = docker([...base, "ps", "-q", "failing-probe"]);
  check(failingProbe.stdout.trim() === "", "dependent probe started after migration failure");
  check(sql("SELECT COUNT(*) FROM jungol_bada.migrations WHERE version=4") === "0", "failed migration version was recorded");
} finally {
  if (existsSync(unreadableSibling)) chmodSync(unreadableSibling, 0o700);
  docker([...base, "--profile", "pending", "--profile", "failing", "down", "--volumes", "--remove-orphans"]);
  rmSync(context, { force: true, recursive: true });
}

console.log("Compose startup-order integration passed: fresh/no-op/pending/failure gates and cleanup.");
