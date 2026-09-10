import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const containerName = `jungol-collector-test-${randomUUID()}`;
const rootPassword = randomBytes(32).toString("base64url");
const collectorDirectory = fileURLToPath(new URL("../", import.meta.url));
const childEnvironment = {
  ...process.env,
  MYSQL_PWD: rootPassword,
  MYSQL_ROOT_PASSWORD: rootPassword,
};

function docker(arguments_, options = {}) {
  return spawnSync("docker", arguments_, {
    encoding: "utf8",
    env: childEnvironment,
    timeout: 60_000,
    ...options,
  });
}

function requireSuccess(result, action) {
  if (result.status !== 0) {
    throw new Error(
      `Docker ${action} failed (exit ${result.status ?? "timeout"})`,
    );
  }
  return result.stdout.trim();
}

async function waitForDatabase() {
  const deadline = Date.now() + 90_000;
  while (true) {
    const result = docker([
      "exec",
      "-e",
      "MYSQL_PWD",
      containerName,
      "mysqladmin",
      "--protocol=TCP",
      "-h127.0.0.1",
      "-uroot",
      "ping",
    ]);
    if (result.status === 0) return;
    if (Date.now() >= deadline) {
      throw new Error("Disposable MySQL 9.3 startup timed out");
    }
    await setTimeout(500);
  }
}

function hostPort() {
  const endpoint = requireSuccess(
    docker(["port", containerName, "3306/tcp"]),
    "port lookup",
  );
  const port = endpoint.split(":").at(-1);
  if (!port || !/^\d+$/.test(port)) {
    throw new Error("Docker did not report a loopback MySQL port");
  }
  return port;
}

const testFiles = [
  "test/mysql.integration.test.ts",
  "test/lifecycle-mysql.test.ts",
];
let cleanupRequired = false;
try {
  cleanupRequired = true;
  requireSuccess(
    docker([
      "run",
      "-d",
      "--name",
      containerName,
      "--tmpfs",
      "/var/lib/mysql:rw,noexec,nosuid,size=1g",
      "--memory",
      "1536m",
      "--cpus",
      "1.5",
      "--pids-limit",
      "256",
      "-e",
      "MYSQL_ROOT_PASSWORD",
      "-p",
      "127.0.0.1::3306",
      "mysql:9.3.0",
    ]),
    "container start",
  );
  await waitForDatabase();
  const testEnvironment = {
    ...childEnvironment,
    MYSQL_TEST_HOST: "127.0.0.1",
    MYSQL_TEST_PORT: hostPort(),
    MYSQL_TEST_PASSWORD: rootPassword,
  };
  for (const file of testFiles) {
    const fixture = spawnSync(
      process.execPath,
      ["--import", "tsx", "test/mysql-migration-fixture.mjs"],
      {
        cwd: collectorDirectory,
        env: testEnvironment,
        stdio: "inherit",
        timeout: 120_000,
      },
    );
    if (fixture.status !== 0) {
      process.exitCode = 1;
      break;
    }
    const tests = spawnSync(
      process.execPath,
      ["--import", "tsx", "--test", file],
      {
        cwd: collectorDirectory,
        env: testEnvironment,
        stdio: "inherit",
        timeout: 180_000,
      },
    );
    if (tests.status !== 0) process.exitCode = 1;
    requireSuccess(
      docker([
        "exec",
        "-e",
        "MYSQL_PWD",
        containerName,
        "mysql",
        "-uroot",
        "-e",
        "DROP DATABASE jungol_bada",
      ]),
      "database cleanup",
    );
    if (process.exitCode !== undefined) break;
  }
} finally {
  if (cleanupRequired) {
    const cleanup = docker(["rm", "-f", "-v", containerName]);
    const inspected = docker(["container", "inspect", containerName]);
    if (
      (cleanup.status !== 0 || inspected.status === 0) &&
      process.exitCode === undefined
    ) {
      process.exitCode = 1;
    }
  }
}
