import assert from "node:assert/strict";
import test from "node:test";
import { CollectorConfigLoader } from "../src/config.js";

const secrets = {
  DB_PASSWORD: "db-secret",
  JUNGOL_USERNAME: "user-secret",
  JUNGOL_PASSWORD: " password\n",
};

test("Given only three secrets When parsing Then production settings are fixed", () => {
  const loader = new CollectorConfigLoader();
  const result = loader.parse(secrets);
  assert.deepEqual(result.database, {
    host: "anabada-mysql",
    port: 3306,
    user: "root",
    name: "jungol_bada",
  });
  assert.equal(result.baseUrl, "https://jungol.co.kr");
  assert.equal(result.groupId, 1125);
  assert.equal(result.profileDir, "/var/lib/jungol/profile");
  assert.equal(result.intervalMs, 600000);
  assert.equal(result.concurrency, 2);
  assert.equal(result.maxPages, 100);
  assert.equal(result.headless, true);
  assert.equal(result.loginTimeoutMs, 60000);
  assert.equal(result.pageTimeoutMs, 30000);
  assert.equal(result.randomSeed, "anabada");
  assert.equal(result.runOnce, false);
  assert.equal(result.targetAccountId, undefined);
  assert.equal(result.emergencyWebhookUrl, undefined);
  assert.deepEqual(result.credentials, {
    username: secrets.JUNGOL_USERNAME,
    password: secrets.JUNGOL_PASSWORD,
    databasePassword: secrets.DB_PASSWORD,
  });
  assert.equal(Object.isFrozen(result.credentials), true);
});

test("Given an emergency webhook URL When parsing Then preserves the optional endpoint", () => {
  const result = new CollectorConfigLoader().parse({
    ...secrets,
    WEBHOOK_URL: "https://discord.com/api/webhooks/test/token",
  });

  assert.equal(
    result.emergencyWebhookUrl,
    "https://discord.com/api/webhooks/test/token",
  );
});

test("Given an empty emergency webhook URL When parsing Then disables emergency alerts", () => {
  const result = new CollectorConfigLoader().parse({
    ...secrets,
    WEBHOOK_URL: "",
  });

  assert.equal(result.emergencyWebhookUrl, undefined);
});

test("Given a malformed emergency webhook URL When parsing Then rejects the configuration", () => {
  assert.throws(
    () =>
      new CollectorConfigLoader().parse({
        ...secrets,
        WEBHOOK_URL: "not-a-url",
      }),
    { code: "invalid_config" },
  );
});

for (const key of Object.keys(secrets)) {
  for (const value of [undefined, "", 123]) {
    test(`Given ${key} is ${String(value)} When parsing Then rejects without exposing secrets`, () => {
      assert.throws(
        () => new CollectorConfigLoader().parse({ ...secrets, [key]: value }),
        { code: "invalid_config", message: "invalid_config" },
      );
    });
  }
}

test("Given stale environment overrides When parsing Then ignores every removed setting", () => {
  const input = {
    ...secrets,
    JUNGOL_USERNAME_FILE: "/missing/user",
    JUNGOL_PASSWORD_FILE: "/missing/pass",
    JUNGOL_DB_PASSWORD_FILE: "/missing/db",
    JUNGOL_DB_PASSWORD: "old",
    JUNGOL_DB_USER: "old",
    DB_HOST: "old",
    DB_PORT: "1",
    DB_NAME: "old",
    JUNGOL_BASE_URL: "http://old",
    JUNGOL_GROUP_ID: "1",
    JUNGOL_PROFILE_DIR: "/old",
    JUNGOL_SYNC_INTERVAL_MS: "1",
    JUNGOL_MAX_WORKERS: "9",
    JUNGOL_MAX_PAGES: "9",
    JUNGOL_INITIAL_BACKFILL_MAX_PAGES: "9",
    JUNGOL_HEADLESS: "false",
    JUNGOL_REQUEST_DELAY_MS: "9",
    JUNGOL_LOGIN_TIMEOUT_MS: "9",
    JUNGOL_PAGE_TIMEOUT_MS: "9",
    RANDOM_SEED: "old",
    COLLECTOR_RUN_ONCE: "true",
    JUNGOL_TARGET_ACCOUNT_ID: "old",
  };
  const loader = new CollectorConfigLoader();
  assert.deepEqual(loader.parse(input), loader.parse(secrets));
});

test("Given only stale secret file paths When parsing Then requires direct secrets", () => {
  assert.throws(
    () =>
      new CollectorConfigLoader().parse({
        JUNGOL_USERNAME_FILE: "/old",
        JUNGOL_PASSWORD_FILE: "/old",
        JUNGOL_DB_PASSWORD_FILE: "/old",
      }),
    { code: "invalid_config" },
  );
});

test("Given injected fixture settings When parsing Then uses them independently of the environment", () => {
  const loader = new CollectorConfigLoader({
    profileDir: "/tmp/fixture",
    intervalMs: 1,
    runOnce: true,
  });
  const result = loader.parse(secrets);
  assert.equal(result.profileDir, "/tmp/fixture");
  assert.equal(result.intervalMs, 1);
  assert.equal(result.runOnce, true);
});
