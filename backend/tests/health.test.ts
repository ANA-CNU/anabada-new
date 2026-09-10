import { expect, test } from "bun:test";
import { BoundedHealthTimeout, createHealthRoute } from "../src/api/health.js";
import type { InternalIncidentReporter } from "../src/emergency-webhook.js";
import type { BackendEmergencyIncident } from "../src/emergency-webhook.js";
import type { DatabaseExecutor } from "../src/infrastructure/mysql/database-session.js";
import { sqlOperations } from "../src/infrastructure/mysql/database-session.js";
import { requiredApplicationTables } from "../src/infrastructure/mysql/repositories/health-repository.js";
import { HealthRepository } from "../src/infrastructure/mysql/repositories/health-repository.js";
import type { Clock } from "../src/infrastructure/time.js";

const clock: Clock = { now: () => new Date("2026-09-08T00:00:00.000Z") };
const reporter: InternalIncidentReporter = { report: async () => "delivered" };
const timeout = {
  run: <T>(operation: () => Promise<T>): Promise<T> => operation(),
};

test("Given an unready schema When health is requested Then it returns a sanitized 503", async () => {
  const route = createHealthRoute(
    { check: async () => false },
    clock,
    reporter,
    timeout,
  );
  const response = await route.handle(new Request("http://localhost/health"));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unhealthy" });
});

test("Given a ready schema When health is requested Then it returns a UTC timestamp", async () => {
  const route = createHealthRoute(
    { check: async () => true },
    clock,
    reporter,
    timeout,
  );
  const response = await route.handle(new Request("http://localhost/health"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "healthy",
    timestamp: "2026-09-08T00:00:00.000Z",
  });
});

test("Given migration 003 schema When checking required tables Then uses its exact application table set", () => {
  expect(requiredApplicationTables).toEqual([
    "event",
    "event_problem",
    "hook",
    "problem",
    "ranking_boards",
    "ranked_users",
    "score_history",
    "user",
    "user_bias_total",
  ]);
});

test("Given a health repository When issuing readiness and schema probes Then assigns their distinct operation IDs", async () => {
  const database: DatabaseExecutor = {
    select: async (operation) => {
      expect(operation.id).toBe(sqlOperations.healthTables.id);
      return [];
    },
    selectOne: async (operation) => {
      expect(operation.id).toBe(sqlOperations.healthReady.id);
      return undefined;
    },
    execute: async () => ({ affectedRows: 0, insertId: 0 }),
  };
  const repository = new HealthRepository(database);
  await repository.ready();
  await repository.hasRequiredTables();
});

test("Given a health repository When checking schema migration Then requires migration 003", async () => {
  let migrationValues: readonly unknown[] = [];
  const database: DatabaseExecutor = {
    select: async () => [],
    selectOne: async (operation, _sql, values) => {
      expect(operation.id).toBe(sqlOperations.healthMigrations.id);
      migrationValues = values;
      return undefined;
    },
    execute: async () => ({ affectedRows: 0, insertId: 0 }),
  };
  await expect(
    new HealthRepository(database).hasRequiredMigration(),
  ).resolves.toBe(false);
  expect(migrationValues).toEqual([3]);
});

test("Given a non-resolving health probe When its timer expires Then returns one sanitized unavailable incident", async () => {
  let fire: (() => void) | undefined;
  let cleared = false;
  const incidents: BackendEmergencyIncident[] = [];
  const route = createHealthRoute(
    { check: () => new Promise<boolean>(() => {}) },
    clock,
    {
      report: async (incident) => {
        incidents.push(incident);
        return "delivered";
      },
    },
    new BoundedHealthTimeout({
      setTimeout: (callback) => {
        fire = callback;
        return 1;
      },
      clearTimeout: () => {
        cleared = true;
      },
    }),
  );
  const responsePromise = route.handle(new Request("http://localhost/health"));
  await Promise.resolve();
  fire?.();
  const response = await responsePromise;
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unhealthy" });
  expect(incidents).toEqual([
    {
      code: "database_unavailable",
      operationId: "health.ready",
      occurredAt: clock.now(),
    },
  ]);
  expect(cleared).toBe(true);
});
