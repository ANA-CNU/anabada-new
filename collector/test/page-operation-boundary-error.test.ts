import assert from "node:assert/strict";
import { test } from "node:test";
import { errors } from "playwright";
import { CycleTrace } from "../src/application/cycle-diagnostics.js";
import type { CycleReport } from "../src/application/cycle-types.js";
import { GroupFeedCursorError } from "../src/group-feed-error.js";
import { IncidentFacts } from "../src/incident-facts.js";
import { JungolError } from "../src/jungol/errors.js";
import { type PageCloser, PageOperation } from "../src/jungol/page.js";

test("Given a boundary error from page work When PageOperation runs Then it preserves the exact error", async () => {
  const page: PageCloser = { close: async () => {} };
  const expected = new GroupFeedCursorError();

  await assert.rejects(
    new PageOperation().run(page, undefined, async () => {
      throw expected;
    }),
    (error: unknown) => {
      assert.equal(error, expected);
      assert.equal(error instanceof GroupFeedCursorError, true);
      return true;
    },
  );
});

test("Given a group navigation timeout When PageOperation translates it Then it retains the precise safe stage", async () => {
  // Given
  const page: PageCloser = { close: async () => {} };

  // When / Then
  await assert.rejects(
    new PageOperation().run(
      page,
      undefined,
      async () => {
        throw new errors.TimeoutError("private browser detail");
      },
      { code: "group_feed_navigation_failed", stage: "navigation" },
    ),
    (error: unknown) => {
      assert.equal(error instanceof JungolError, true);
      assert.equal((error as JungolError).code, "group_feed_navigation_failed");
      assert.deepEqual((error as JungolError).diagnostics, {
        stage: "navigation",
        reason: "timeout",
        originalErrorKind: "TimeoutError",
        location: {
          method: "PageOperation.run",
          source: "collector/src/jungol/page.ts",
          line: 53,
        },
      });
      return true;
    },
  );
});

test("Given a parser TypeError When PageOperation translates it Then it remains an internal failure with its safe original kind", async () => {
  // Given
  const page: PageCloser = { close: async () => {} };

  // When / Then
  await assert.rejects(
    new PageOperation().run(
      page,
      undefined,
      async () => {
        throw new TypeError("private parser detail");
      },
      { code: "group_feed_responsewait_failed", stage: "responsewait" },
    ),
    (error: unknown) => {
      assert.equal(error instanceof JungolError, true);
      if (!(error instanceof JungolError)) return false;
      assert.equal(error.diagnostics?.stage, "responsewait");
      assert.equal(error.diagnostics?.reason, "internal");
      assert.equal(error.diagnostics?.originalErrorKind, "TypeError");
      return true;
    },
  );
});

test("Given a response-wait timeout with a collector frame When PageOperation reaches CycleTrace Then the formatter preserves its safe source location", async () => {
  // Given
  const page: PageCloser = { close: async () => {} };
  const trace = new CycleTrace("responsewait-cycle", () => 1);
  const timeout = new errors.TimeoutError("private browser detail");
  timeout.stack = [
    "TimeoutError: private browser detail",
    "    at GroupFeedCollector.readPage (file:///app/collector/src/jungol/group-feed.ts:168:9)",
  ].join("\n");

  // When
  await assert.rejects(
    trace.run("responsewait", { pageNumber: 1 }, () =>
      new PageOperation().run(
        page,
        undefined,
        async () => {
          throw timeout;
        },
        {
          code: "group_feed_responsewait_failed",
          stage: "responsewait",
          pageNumber: 1,
          timeoutMs: 30_000,
        },
      ),
    ),
  );
  const report: CycleReport = {
    status: "failed",
    rankCount: 0,
    syncUserCount: 0,
    metadataUserCount: 0,
    successUserCount: 0,
    failedUserCount: 0,
    scannedAttemptCount: 0,
    acceptedAttemptCount: 0,
    insertedAttemptCount: 0,
    duplicateAttemptCount: 0,
    errorCode: "group_feed_responsewait_failed",
    accountFailureCount: 0,
    accountFailures: [],
    commonFailures: [],
    cycleTrace: trace.snapshot(),
  };

  // Then
  const facts = new IncidentFacts().from(report).join("\n");
  assert.match(
    facts,
    /최초 실패 위치 `PageOperation\.run \(collector\/src\/jungol\/group-feed\.ts:168\)`/,
  );
  assert.match(facts, /실행 commit `unknown`/);
  assert.equal(facts.includes("private browser detail"), false);
});
