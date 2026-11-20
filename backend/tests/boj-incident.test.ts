import { expect, test } from "bun:test";
import { BojHtmlError } from "../src/boj/html-source.js";
import { BojIncidents } from "../src/boj/incident.js";
import { BojReadError } from "../src/boj/page-reader.js";
import { BojSettlementConflict } from "../src/boj/settlement-repository.js";
import type { BackendEmergencyIncident } from "../src/emergency-webhook.js";
import { DatabaseQueryError } from "../src/infrastructure/errors.js";

test("reports parser, persistence, and provider failures using stable codes", async () => {
  const alerts: BackendEmergencyIncident[] = [];
  const incidents = new BojIncidents({
    async report(incident) {
      alerts.push(incident);
      return "delivered";
    },
  });

  await incidents.failure(
    "boj.cycle_failed",
    new BojHtmlError("missing_table"),
  );
  await incidents.failure(
    "boj.member_failed",
    new DatabaseQueryError("fixture.query"),
  );
  await incidents.accessBlocked();
  expect(alerts.map(({ code, operationId }) => [code, operationId])).toEqual([
    ["boj_missing_table", "boj.cycle_failed"],
    ["database_query_failed", "boj.member_failed"],
    ["solved_ac_access_blocked", "boj.solved_ac_refresh_failed"],
  ]);
  expect(alerts.every(({ routeTemplate }) => routeTemplate === undefined)).toBe(
    true,
  );
});

test("leaves rate limits and a changed cursor to the retry paths", async () => {
  const incidents = new BojIncidents({
    async report() {
      throw new Error("Unexpected alert");
    },
  });
  let alerts = 0;
  const observed = new BojIncidents({
    async report() {
      alerts += 1;
      return "delivered";
    },
  });
  await observed.failure(
    "boj.cycle_failed",
    new BojReadError("http_status", 429),
  );
  await observed.failure(
    "boj.member_failed",
    new BojSettlementConflict("cursor_changed"),
  );
  expect(alerts).toBe(0);
  await expect(incidents.accessBlocked()).resolves.toBeUndefined();
});
