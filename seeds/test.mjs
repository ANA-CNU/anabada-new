import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const id = randomUUID();
const network = `anabada-seed-${id}`;
const mysql = `anabada-seed-mysql-${id}`;
const migrator = `anabada-seed-migrator-${id}`;
const seeder = `anabada-seed-seeder-${id}`;
const migratorImage = `anabada-seed-migrator:${id}`;
const password = `seed-test-${randomUUID()}`;
const clientHome = mkdtempSync(resolve(tmpdir(), "anabada-seed-client-"));
const environment = {
  ...process.env,
  DB_PASSWORD: password,
  MYSQL_PWD: password,
  MYSQL_ROOT_PASSWORD: password,
};

function docker(args) {
  return spawnSync("docker", args, { cwd: root, encoding: "utf8", env: environment, maxBuffer: 1_048_576, timeout: 300_000 });
}

function requireOutput(args) {
  const result = docker(args);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function sql(statement) {
  return requireOutput(["exec", "-e", "MYSQL_PWD", mysql, "mysql", "--default-character-set=utf8mb4", "-uroot", "-Nse", statement]);
}

function runEphemeral(name, args) {
  const result = docker(["run", "--name", name, ...args]);
  docker(["rm", "-f", name]);
  return result;
}

function seed() {
  return runEphemeral(seeder, [
    "--network", network,
    "-e", "PREVIEW_SEED=anabada-dev-seeded",
    "-e", "DB_HOST=anabada-mysql",
    "-e", "DB_NAME=jungol_bada",
    "-e", "DB_PASSWORD",
    "-e", "PATH=/seed-client/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "-v", `${resolve(root, "seeds")}:/seeds:ro`,
    "-v", `${clientHome}:/seed-client:ro`,
    "--entrypoint", "/bin/sh", "mysql:9.3.0", "/seeds/seed.sh",
  ]);
}

try {
  mkdirSync(resolve(clientHome, "bin"));
  writeFileSync(resolve(clientHome, "bin/mysql"), "#!/bin/sh\nexec /usr/bin/mysql --default-character-set=latin1 \"$@\"\n", "utf8");
  chmodSync(resolve(clientHome, "bin/mysql"), 0o755);
  requireOutput(["build", "-t", migratorImage, "-f", "migrations/Dockerfile", "migrations"]);
  requireOutput(["network", "create", network]);
  requireOutput([
    "run", "-d", "--name", mysql, "--network", network, "--network-alias", "anabada-mysql",
    "--memory", "1536m", "--cpus", "1.5", "--pids-limit", "256", "--tmpfs", "/var/lib/mysql:size=1g",
    "-e", "MYSQL_ROOT_PASSWORD", "mysql:9.3.0",
  ]);

  const deadline = Date.now() + 90_000;
  while (docker(["exec", "-e", "MYSQL_PWD", mysql, "mysqladmin", "--protocol=TCP", "-h127.0.0.1", "-uroot", "ping", "--silent"]).status !== 0) {
    if (Date.now() > deadline) throw new Error("Disposable MySQL startup timed out");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }

  check(runEphemeral(migrator, ["--network", network, "-e", "DB_PASSWORD", migratorImage]).status === 0, "002 and 003 migrations failed");
  check(seed().status === 0, "first UTF-8 seed failed");
  check(sql("SELECT korean_name FROM jungol_bada.user WHERE id=80001") === "김서준", "stored demo name was mojibake");
  check(sql("SELECT problem_name FROM jungol_bada.problem WHERE id=910011") === "데모 알고리즘 1-1", "stored problem_name was mojibake");
  check(sql("SELECT title FROM jungol_bada.event WHERE id=9002") === "진행 중 데모 이벤트", "stored event title was mojibake");
  check(sql("SELECT `desc` FROM jungol_bada.score_history WHERE id=93001") === "#4011를 해결하여, 일일 점수 획득", "stored score description was mojibake");
  const counts = sql("SELECT CONCAT((SELECT COUNT(*) FROM jungol_bada.user WHERE id BETWEEN 80001 AND 80030), ':', (SELECT COUNT(*) FROM jungol_bada.problem WHERE id BETWEEN 910011 AND 910306), ':', (SELECT COUNT(*) FROM jungol_bada.event WHERE id BETWEEN 9001 AND 9003), ':', (SELECT COUNT(*) FROM jungol_bada.score_history WHERE id BETWEEN 93001 AND 93310), ':', (SELECT COUNT(*) FROM jungol_bada.user_bias_total WHERE user_id BETWEEN 80001 AND 80030))");
  check(counts === "30:180:3:75:30", `unexpected first seed counts: ${counts}`);
  check(sql("SELECT COUNT(*) FROM jungol_bada.user_bias_total WHERE user_id BETWEEN 80001 AND 80030 AND (score_month IS NULL OR total_point IS NULL)") === "0", "seeded score cache has invalid values");
  check(sql("SELECT COUNT(*) FROM jungol_bada.user_bias_total total WHERE total.user_id BETWEEN 80001 AND 80030 AND total.score_month = DATE_FORMAT(UTC_TIMESTAMP() + INTERVAL 9 HOUR, '%Y-%m-01') AND total.total_point = COALESCE((SELECT SUM(history.bias) FROM jungol_bada.score_history history WHERE history.user_id = total.user_id AND history.created_at >= DATE_SUB(DATE_FORMAT(UTC_TIMESTAMP() + INTERVAL 9 HOUR, '%Y-%m-01'), INTERVAL 9 HOUR) AND history.created_at < DATE_SUB(DATE_ADD(DATE_FORMAT(UTC_TIMESTAMP() + INTERVAL 9 HOUR, '%Y-%m-01'), INTERVAL 1 MONTH), INTERVAL 9 HOUR)), 0)") === "30", "seeded score cache does not equal this KST month's ledger sum");
  check(seed().status === 0, "second UTF-8 seed failed");
  const repeatedCounts = sql("SELECT CONCAT((SELECT COUNT(*) FROM jungol_bada.user WHERE id BETWEEN 80001 AND 80030), ':', (SELECT COUNT(*) FROM jungol_bada.problem WHERE id BETWEEN 910011 AND 910306), ':', (SELECT COUNT(*) FROM jungol_bada.event WHERE id BETWEEN 9001 AND 9003), ':', (SELECT COUNT(*) FROM jungol_bada.score_history WHERE id BETWEEN 93001 AND 93310), ':', (SELECT COUNT(*) FROM jungol_bada.user_bias_total WHERE user_id BETWEEN 80001 AND 80030))");
  check(repeatedCounts === counts, `repeat seed changed demo row counts: ${counts} -> ${repeatedCounts}`);
} finally {
  docker(["rm", "-f", mysql]);
  docker(["rm", "-f", migrator]);
  docker(["rm", "-f", seeder]);
  docker(["network", "rm", network]);
  docker(["image", "rm", "-f", migratorImage]);
  rmSync(clientHome, { force: true, recursive: true });
}
