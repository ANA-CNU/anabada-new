import { expect, test } from "bun:test";
import {
  BackendConfigError,
  BackendConfigLoader,
} from "../src/config/backend-config.js";

const environment = {
  DB_HOST: "db",
  DB_PORT: "3306",
  DB_USER: "app",
  DB_PASSWORD: "",
  DB_NAME: "anabada",
  JWT_SECRET: "test-secret",
  NODE_ENV: "test",
  ALLOWED_ORIGIN: "http://localhost:3000",
} as const;

test("Given an empty test database password When loading config Then preserves the password without exposing it", () => {
  const config = new BackendConfigLoader().createForTest(environment);
  expect(config.DB_PASSWORD).toBe("");
});

test("Given stage runtime and an empty database password When loading config Then rejects it without leaking secrets", () => {
  const stage = {
    ...environment,
    NODE_ENV: "stage",
    DB_PASSWORD: "db-secret",
    JWT_SECRET: "jwt-secret",
  } as const;
  const invalid = { ...stage, DB_PASSWORD: "" };
  try {
    new BackendConfigLoader().load(invalid);
  } catch (error) {
    if (error instanceof BackendConfigError) {
      expect(error.message).toContain("DB_PASSWORD");
      expect(error.message).not.toContain("db-secret");
      expect(error.message).not.toContain("jwt-secret");
      return;
    }
  }
  throw new Error("expected config failure");
});

test("Given an empty webhook URL When loading config Then disables webhook and rejects non-http protocols", () => {
  expect(
    new BackendConfigLoader().createForTest({ ...environment, WEBHOOK_URL: "" })
      .WEBHOOK_URL,
  ).toBeUndefined();
  expect(() =>
    new BackendConfigLoader().createForTest({
      ...environment,
      WEBHOOK_URL: "ftp://example.com/hook",
    }),
  ).toThrow(BackendConfigError);
});

test("Given a missing secret When loading config Then reports only the invalid field", () => {
  const { JWT_SECRET: ignored, ...invalid } = environment;
  expect(() => new BackendConfigLoader().load(invalid)).toThrow(
    BackendConfigError,
  );
  try {
    new BackendConfigLoader().load(invalid);
  } catch (error) {
    if (error instanceof BackendConfigError)
      expect(error.message).not.toContain("test-secret");
  }
});
