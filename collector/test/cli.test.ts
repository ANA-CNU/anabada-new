import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Given direct secrets When checking configuration Then prints only safe success", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "check-config"],
    {
      encoding: "utf8",
      env: {
        JUNGOL_USERNAME: "dummy-private-user",
        JUNGOL_PASSWORD: "dummy-private-password",
        DB_PASSWORD: "dummy-private-db",
      },
    },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '{"status":"config_valid"}\n');
  assert.equal(result.stderr, "");
});
test("safe command exits nonzero on invalid configuration", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "check-config"],
    { encoding: "utf8", env: { JUNGOL_PASSWORD: "sensitive-fixture" } },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    status: "config_invalid",
    code: "invalid_config",
  });
});
test("CLI help describes its explicit safe command", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "--help"],
    { encoding: "utf8", env: {} },
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /check-config/);
});
