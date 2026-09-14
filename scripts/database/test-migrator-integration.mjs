import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCustomMigrationInterruptions } from "./custom-migration-interruptions.mjs";

const root = resolve(import.meta.dirname, "../..");
const id = randomUUID();
const network = `jungol-migrator-${id}`;
const mysql = `mysql-${id}`;
const image = `jungol-migrator-test:${id}`;
const fixture = mkdtempSync(join(tmpdir(), "jungol-migrator-"));
// GitHub runner UID와 image의 non-root node UID 모두 SQL fixture를 traverse해야 한다.
chmodSync(fixture, 0o755);
const password = `migrator-test-${randomUUID()}`;
const dockerEnv = {
  ...process.env,
  DB_PASSWORD: password,
  MYSQL_PWD: password,
  MYSQL_ROOT_PASSWORD: password,
};
const migration = readFileSync(join(root, "migrations/002_create_jungol_bada.sql"));
const checksum = createHash("sha256").update(migration).digest("hex");
const appliedMigrationChecksums = new Map(
  [2, 3, 4].map((version) => {
    const filename = `${String(version).padStart(3, "0")}_${[
      "create_jungol_bada",
      "group_ac_scoring",
      "custom_score_rule",
    ][version - 2]}.sql`;
    return [
      version,
      createHash("sha256")
        .update(readFileSync(join(root, "migrations", filename)))
        .digest("hex"),
    ];
  }),
);

function docker(args, options = {}) {
  return spawnSync("docker", args, { cwd: root, encoding: "utf8", env: dockerEnv, ...options });
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
    "exec", "-e", "MYSQL_PWD", mysql, "mysql", "-uroot", "-Nse", statement,
  ]);
}

function runMigrator(extra = []) {
  return docker([
    "run", "--rm", "--network", network, "-e", "DB_PASSWORD",
    ...extra, image,
  ]);
}

function runMigratorAsync(extra = []) {
  return new Promise((resolveRun) => {
    const child = spawn("docker", [
      "run", "--rm", "--network", network, "-e", "DB_PASSWORD",
      ...extra, image,
    ], { cwd: root, env: dockerEnv, stdio: ["ignore", "pipe", "pipe"] });
    let outputText = "";
    const collect = (chunk) => {
      outputText = `${outputText}${chunk}`.slice(-8192);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("close", (code) =>
      resolveRun({
        code,
        errorCode: /"code":"([a-z_]+)"/.exec(outputText)?.[1] ?? null,
      }),
    );
  });
}

try {
  output(["build", "-t", image, "-f", "migrations/Dockerfile", "migrations"]);
  output(["network", "create", network]);
  output([
    "run", "-d", "--name", mysql, "--network", network, "--memory", "1536m",
    "--cpus", "1.5", "--pids-limit", "256", "--tmpfs", "/var/lib/mysql:size=1g",
    "--network-alias", "anabada-mysql",
    "-e", "MYSQL_ROOT_PASSWORD", "mysql:9.3.0",
  ]);
  const deadline = Date.now() + 90000;
  while (docker(["exec", "-e", "MYSQL_PWD", mysql, "mysqladmin", "--protocol=TCP", "-h127.0.0.1", "-uroot", "ping", "--silent"]).status !== 0) {
    if (Date.now() > deadline) throw new Error("Disposable MySQL startup timed out");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }

  check(docker([
    "run", "--rm", "--network", network, "-e", "DB_PASSWORD", image,
    "node", "--input-type=module", "-e", `
      import { MigrationCatalog } from './dist/catalog.js';
      import { MigrationRunner } from './dist/runner.js';
      import { MigrationRepository, MysqlMigrationConnectionFactory } from './dist/repository.js';
      import { parseConfiguration } from './dist/config.js';
      import { createLogger } from './dist/logger.js';
      const catalog = await new MigrationCatalog('/app').load();
      await new MigrationRunner(new MigrationRepository(parseConfiguration(process.env), new MysqlMigrationConnectionFactory()), createLogger()).run(catalog.filter(entry => entry.version <= 3));
    `,
  ]).status === 0, "pre-custom migration bootstrap failed");
  sql("INSERT INTO jungol_bada.user (id,jungol_name,corrects,submissions,solution,korean_name,tier,ac_rating,ignored,jungol_account_id,rank_wrong_count) VALUES (700,'custom_upgrade',7,9,7007,'보존',21,1777,0,700,4); INSERT INTO jungol_bada.problem (id,user_id,problem,problem_name,problem_tier,submitted_at,level,repeatation,verdict,external_submission_id,score,estimated_tier) VALUES (700,700,7000,'보존 문제',20,'2026-09-13 00:00:00.000',20,0,'accepted',7000,70,20); INSERT INTO jungol_bada.event (id,`begin`,`end`,title,`desc`) VALUES (700,'2026-09-01 00:00:00','2026-09-30 00:00:00','보존 이벤트','보존 설명'); INSERT INTO jungol_bada.hook (id,url,ignored) VALUES (700,'https://preserve.invalid/hook',0); INSERT INTO jungol_bada.score_history (id,user_id,bias,rule_type,`desc`,created_at) VALUES (700,700,-3,'manual','preserve reason','2026-09-13 00:00:00'); INSERT INTO jungol_bada.score_history (id,user_id,bias,rule_type,award_key,score_day) VALUES (701,700,1,'daily','daily:700:2026-09-13','2026-09-13'),(702,700,1,'event','event:700:700:1','2026-09-13'); INSERT INTO jungol_bada.user_bias_total (user_id,total_point,score_month) VALUES (700,-1,'2026-09-01')");
  const preservedProblem = sql("SELECT id,user_id,problem,problem_name,problem_tier,submitted_at,level,repeatation,verdict,external_submission_id,score,estimated_tier FROM jungol_bada.problem WHERE id=700");
  const preservedEvent = sql("SELECT id,`begin`,`end`,title,`desc` FROM jungol_bada.event WHERE id=700");
  const preservedHook = sql("SELECT id,url,ignored FROM jungol_bada.hook WHERE id=700");
  const preservedScore = sql("SELECT id,user_id,bias,`desc`,created_at FROM jungol_bada.score_history WHERE id=700");
  const preservedUser = sql("SELECT id,jungol_name,corrects,submissions,solution,korean_name,tier,ignored,jungol_account_id,rank_wrong_count FROM jungol_bada.user WHERE id=700");
  check(runMigrator().status === 0, "custom upgrade migration failed");
  check(sql("SELECT id,user_id,bias,`desc`,created_at FROM jungol_bada.score_history WHERE id=700") === preservedScore, "custom upgrade changed score data");
  check(sql("SELECT id,jungol_name,corrects,submissions,solution,korean_name,tier,ignored,jungol_account_id,rank_wrong_count FROM jungol_bada.user WHERE id=700") === preservedUser, "removing AC Rating changed retained user data");
  check(sql("SELECT id,user_id,problem,problem_name,problem_tier,submitted_at,level,repeatation,verdict,external_submission_id,score,estimated_tier FROM jungol_bada.problem WHERE id=700") === preservedProblem, "removing AC Rating changed problem data");
  check(sql("SELECT id,`begin`,`end`,title,`desc` FROM jungol_bada.event WHERE id=700") === preservedEvent, "removing AC Rating changed event data");
  check(sql("SELECT id,url,ignored FROM jungol_bada.hook WHERE id=700") === preservedHook, "removing AC Rating changed hook data");
  check(sql("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='jungol_bada' AND table_name='user' AND column_name='ac_rating'") === "0", "AC Rating column was not removed");
  check(sql("SELECT GROUP_CONCAT(rule_type ORDER BY id) FROM jungol_bada.score_history WHERE id BETWEEN 700 AND 702") === "custom,daily,event", "upgrade did not preserve automatic types");
  check(sql("SELECT total_point FROM jungol_bada.user_bias_total WHERE user_id=700") === "-1", "upgrade changed cache");
  sql("INSERT INTO jungol_bada.score_history (id,user_id,bias) VALUES (703,700,5)");
  check(sql("SELECT rule_type FROM jungol_bada.score_history WHERE id=703") === "custom", "default is not custom");
  for (const rule of ["manual", "daily", "event"])
    check(docker(["exec", "-e", "MYSQL_PWD", mysql, "mysql", "-uroot", "-e", `INSERT INTO jungol_bada.score_history (user_id,bias,rule_type) VALUES (700,-2,'${rule}')`]).status !== 0, "invalid score contract was accepted");
  check(sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='jungol_bada'") === "12", "fresh migration did not create the active schema and migrations table");
  check(sql("SELECT COUNT(*) FROM jungol_bada.migrations") === "4", "active migration ledger count was not recorded");
  check(sql("SELECT GROUP_CONCAT(version ORDER BY version) FROM jungol_bada.migrations") === "2,3,4,5", "active migrations were not recorded");
  for (const [version, expectedChecksum] of appliedMigrationChecksums)
    check(sql(`SELECT checksum_sha256 FROM jungol_bada.migrations WHERE version=${version}`) === expectedChecksum, `applied migration ${version} checksum changed`);
  check(sql("SELECT COUNT(*) FROM jungol_bada.migrations WHERE LENGTH(checksum_sha256) <> 64") === "0", "checksum was not recorded");
  sql("INSERT INTO jungol_bada.user (jungol_name, jungol_account_id) VALUES ('sentinel', 999999)");
  check(runMigrator().status === 0, "second migration was not a no-op");
  check(sql("SELECT COUNT(*) FROM jungol_bada.user WHERE jungol_name='sentinel'") === "1", "no-op migration lost sentinel");

  await runCustomMigrationInterruptions({ docker, sql, image, network, runMigrator });

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

  cpSync(join(root, "scripts/database/test-fixtures/003_fail_after_sentinel.sql"), join(fixture, "006_fail_after_sentinel.sql"));
  const fixtureMounts = [
    "-v", `${join(fixture, "006_fail_after_sentinel.sql")}:/app/006_fail_after_sentinel.sql:ro`,
  ];
  check(runMigrator(fixtureMounts).status !== 0, "failing pending migration unexpectedly succeeded");
  check(sql("SELECT COUNT(*) FROM jungol_bada.migration_failure_probe") === "1", "failing migration did not execute its probe");
  check(sql("SELECT COUNT(*) FROM jungol_bada.migrations WHERE version=6") === "0", "failed migration was recorded");
  check(sql("SELECT COUNT(*) FROM jungol_bada.user WHERE jungol_name='sentinel_after_reset'") === "1", "failed migration lost sentinel");
  writeFileSync(join(fixture, "006_fail_after_sentinel.sql"), "SELECT SLEEP(2); CREATE TABLE lock_probe (id INT PRIMARY KEY);\n");
  const [first, second] = await Promise.all([
    runMigratorAsync(fixtureMounts),
    runMigratorAsync(fixtureMounts),
  ]);
  check(
    first.code === 0 && second.code === 0,
    `concurrent migrators did not serialize: ${first.errorCode ?? first.code},${second.errorCode ?? second.code}`,
  );
  check(sql("SELECT COUNT(*) FROM jungol_bada.migrations WHERE version=6") === "1", "concurrent migration was not recorded once");
  check(output(["image", "inspect", image, "--format", "{{.Config.User}}"] ) === "node", "migrator image is not non-root");
  check(docker(["run", "--rm", "--entrypoint", "sh", image, "-ec", "test -z \"$(find /app -type f \\( -name '000_*' -o -name '001_*' \\) -print -quit)\""]).status === 0, "migrator image contains legacy SQL");
} finally {
  docker(["rm", "-f", mysql]);
  docker(["network", "rm", network]);
  docker(["image", "rm", "-f", image]);
  rmSync(fixture, { force: true, recursive: true });
}
