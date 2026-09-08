import assert from "node:assert/strict";
import test from "node:test";

import { ConfigurationError, parseConfiguration } from "../src/config.js";

test("Given a DB_PASSWORD, when parsing configuration, then it returns only fixed connection values", () => {
  const config = parseConfiguration({ DB_PASSWORD: "secret" });

  assert.deepEqual(config, {
    host: "anabada-mysql",
    port: 3306,
    user: "root",
    database: "jungol_bada",
    password: "secret",
  });
});

test("Given no DB_PASSWORD, when parsing configuration, then it rejects configuration", () => {
  assert.throws(() => parseConfiguration({}), ConfigurationError);
});
