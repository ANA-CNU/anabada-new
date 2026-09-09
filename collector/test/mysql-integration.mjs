import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const name = `jungol-collector-test-${randomUUID()}`;
const cwd = fileURLToPath(new URL("../", import.meta.url));
const docker = (args, options = {}) =>
  spawnSync("docker", args, { encoding: "utf8", timeout: 60000, ...options });
const requireSuccess = (result) => {
  if (result.status !== 0) throw new Error(result.stderr || "Command failed");
  return result.stdout.trim();
};
let created = false;
try {
  requireSuccess(
    docker([
      "run",
      "-d",
      "--name",
      name,
      "--tmpfs",
      "/var/lib/mysql",
      "-e",
      "MYSQL_ALLOW_EMPTY_PASSWORD=yes",
      "-p",
      "127.0.0.1::3306",
      "mysql:8.4",
    ]),
  );
  created = true;
  const deadline = Date.now() + 60000;
  while (
    docker([
      "exec",
      name,
      "mysqladmin",
      "--protocol=TCP",
      "-h127.0.0.1",
      "ping",
    ]).status !== 0
  ) {
    if (Date.now() > deadline)
      throw new Error("Disposable MySQL startup timed out");
    await setTimeout(500);
  }
  const migration = readFileSync(
    new URL("../../migrations/002_create_jungol_bada.sql", import.meta.url),
    "utf8",
  );
  const endpoint = requireSuccess(docker(["port", name, "3306"]));
  const port = endpoint.split(":").at(-1);
  for (const file of [
    "test/mysql.integration.test.ts",
    "test/lifecycle-mysql.test.ts",
  ]) {
    requireSuccess(docker(["exec", "-i", name, "mysql"], { input: migration }));
    const tests = spawnSync(
      process.execPath,
      ["--import", "tsx", "--test", file],
      {
        cwd,
        env: { ...process.env, MYSQL_TEST_PORT: port },
        stdio: "inherit",
        timeout: 120000,
      },
    );
    if (tests.status !== 0) process.exitCode = 1;
    requireSuccess(
      docker(["exec", name, "mysql", "-e", "DROP DATABASE jungol_bada"]),
    );
  }
} finally {
  if (created) requireSuccess(docker(["rm", "-f", "-v", name]));
}
