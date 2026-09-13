import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import { pino } from "pino";
import type { CycleReport } from "../src/application/cycle-types.js";
import type { AccountFlowStep } from "../src/application/flow-log.js";
import {
  CollectorIncidentFactory,
  EmergencyAlertFormatter,
  EmergencyWebhookNotifier,
  type EmergencyWebhookTransport,
} from "../src/emergency-alert.js";
import { JungolError } from "../src/jungol/errors.js";

const incident = {
  code: "rank_mismatch",
  signature: "rank_mismatch:runtime",
  occurredAt: new Date("2026-09-08T00:00:00Z"),
  impact: "일부 사용자 수집이 완료되지 않았습니다.",
  actions: ["collector 로그에서 같은 오류 코드를 확인하세요."],
  facts: [],
};

const cycleReport: CycleReport = {
  status: "partial",
  rankCount: 12,
  syncUserCount: 2,
  metadataUserCount: 10,
  successUserCount: 1,
  failedUserCount: 1,
  scannedAttemptCount: 3,
  acceptedAttemptCount: 2,
  insertedAttemptCount: 1,
  duplicateAttemptCount: 1,
  errorCode: "rank_mismatch",
  accountFailureCount: 0,
  accountFailures: [],
  commonFailures: [],
};

const completedAccountSteps = [
  "browser_open",
  "initial_cursor",
  "initial_summary",
  "prepare_snapshot",
  "prepare_attempts",
  "browser_close",
  "initialize_transaction",
  "incremental_collect",
] as const satisfies readonly AccountFlowStep[];

test("Given three sanitized summary failures When creating an incident Then it includes bounded numeric facts", () => {
  const result = new CollectorIncidentFactory().fromCycle(
    {
      ...cycleReport,
      failedUserCount: 3,
      errorCode: "account_summary_mismatch",
      accountFailureCount: 3,
      accountFailures: [
        { accountId: "153884", expectedCount: 3, profileSolvedCount: 10 },
        { accountId: "153860", expectedCount: 2, profileSolvedCount: 5 },
        { accountId: "133924", expectedCount: 1, profileSolvedCount: 73 },
      ].map((failure) => ({
        accountId: failure.accountId,
        mode: "initial_summary" as const,
        code:
          failure.accountId === "133924"
            ? "account_summary_invalid"
            : "account_summary_mismatch",
        diagnostics:
          failure.accountId === "133924"
            ? {
                stage: "account_summary_readiness" as const,
                reason: "timeout" as const,
                timeoutMs: 30_000,
                profileSolvedCount: 73,
                observedLinkCount: 50,
              }
            : {
                stage: "account_summary" as const,
                reason: "mismatch" as const,
                expectedCount: failure.expectedCount,
                profileSolvedCount: failure.profileSolvedCount,
                observedLinkCount: failure.profileSolvedCount,
                distinctLinkCount: failure.profileSolvedCount,
              },
      })),
    },
    incident.occurredAt,
  );
  assert.ok(result);
  const message = new EmergencyAlertFormatter().format(result);

  assert.match(message, /그룹 rank 기대 `3` \/ 프로필 표시 `10`/);
  assert.match(message, /그룹 rank 기대 `2` \/ 프로필 표시 `5`/);
  assert.match(
    message,
    /준비 대기 `30000ms` \/ 프로필 표시 `73` \/ 목록 링크 `50`/,
  );
});

test("Given unsafe diagnostic extras When formatting an incident Then only allowlisted fields reach the alert", () => {
  const diagnostics = new JungolError(
    "account_summary_mismatch",
    Object.assign(
      {
        stage: "account_summary" as const,
        reason: "mismatch" as const,
        expectedCount: 3,
        profileSolvedCount: 10,
      },
      {
        password: "secret-password",
        jwt: "private-jwt",
        url: "https://private.example/path?token=private",
        sql: "SELECT * FROM private_table",
        errorName: "PrivateErrorName",
        stack: "private-stack",
      },
    ),
  ).diagnostics;
  const result = new CollectorIncidentFactory().fromCycle({
    ...cycleReport,
    errorCode: "account_summary_mismatch",
    accountFailureCount: 1,
    accountFailures: [
      {
        accountId: "42",
        mode: "initial_summary",
        code: "account_summary_mismatch",
        diagnostics,
      },
    ],
  });
  assert.ok(result);
  const message = new EmergencyAlertFormatter().format(result);

  for (const forbidden of [
    "secret-password",
    "private-jwt",
    "private.example",
    "private_table",
    "PrivateErrorName",
    "private-stack",
  ])
    assert.equal(message.includes(forbidden), false);
  assert.match(message, /그룹 rank 기대 `3` \/ 프로필 표시 `10`/);
});

test("Given a rethrown DOM failure When formatting the incident Then it preserves the original typed code and safe source frame", () => {
  // Given
  const result = new CollectorIncidentFactory().fromCycle({
    ...cycleReport,
    status: "failed",
    errorCode: "group_feed_rows_timeout",
    commonFailures: [
      {
        stage: "cycle",
        code: "group_feed_rows_timeout",
        diagnostics: new JungolError("group_feed_rows_timeout", {
          stage: "group_feed_rows_growth_wait",
          reason: "timeout",
          timeoutMs: 30_000,
          pageNumber: 3,
          previousRowCount: 100,
          currentRowCount: 100,
          location: {
            method: "GroupFeedCollector.loadNextPage",
            source: "collector/src/jungol/group-feed.ts",
            line: 211,
          },
        }).diagnostics,
      },
    ],
  });
  assert.ok(result);

  // When
  const message = new EmergencyAlertFormatter().format(result);

  // Then
  assert.match(message, /\*\*오류 코드:\*\* `group_feed_rows_timeout`/);
  assert.match(
    message,
    /위치 `GroupFeedCollector\.loadNextPage \(collector\/src\/jungol\/group-feed\.ts:211\)`/,
  );
});

test("Given sanitized HTTP and network diagnostics When formatting an incident Then it preserves only their operational codes", () => {
  const result = new CollectorIncidentFactory().fromCycle({
    ...cycleReport,
    errorCode: "account_summary_http_failed",
    accountFailureCount: 2,
    accountFailures: [
      {
        accountId: "42",
        mode: "initial_summary",
        code: "account_summary_http_failed",
        diagnostics: {
          stage: "account_summary",
          reason: "http",
          httpStatus: 429,
        },
      },
      {
        accountId: "43",
        mode: "initial_summary",
        code: "account_summary_invalid",
        diagnostics: {
          stage: "page_operation",
          reason: "network",
          transportCode: "ETIMEDOUT",
        },
      },
    ],
  });
  assert.ok(result);
  const message = new EmergencyAlertFormatter().format(result);

  assert.match(message, /HTTP 상태 `429`/);
  assert.match(message, /전송 코드 `ETIMEDOUT`/);
});

test("Given eight completed trace events When formatting an incident Then it preserves the final event as a separate code scalar", () => {
  const result = new CollectorIncidentFactory().fromCycle({
    ...cycleReport,
    accountFailureCount: 1,
    accountFailures: [
      {
        accountId: "42",
        mode: "initial_summary",
        code: "account_summary_invalid",
        trace: {
          droppedEventCount: 0,
          events: completedAccountSteps.map((step, index) => ({
            sequence: index + 1,
            elapsedMs: index + 1,
            step,
            outcome: "completed" as const,
          })),
          primaryFailure: undefined,
        },
      },
    ],
  });
  assert.ok(result);

  const message = new EmergencyAlertFormatter().format(result);

  assert.match(message, /`browser_open:completed@1ms`/);
  assert.match(message, /`incremental_collect:completed@8ms`/);
});

test("Given a transaction rollback failure When formatting a bounded incident Then the cycle ID and first failure remain before optional facts", () => {
  // Given
  const result = new CollectorIncidentFactory().fromCycle({
    ...cycleReport,
    cycleTrace: {
      cycleId: "cycle-42",
      durationMs: 1_234,
      transactionStatus: "rollback_failed",
      droppedEventCount: 0,
      events: [],
      firstFailure: {
        sequence: 2,
        elapsedMs: 1_200,
        durationMs: 1_100,
        stage: "navigation",
        outcome: "failed",
        context: {},
      },
    },
  });
  assert.ok(result);

  // When
  const message = new EmergencyAlertFormatter().format(result);

  // Then
  assert.match(message, /cycle `cycle-42` \/ DB transaction `rollback_failed`/);
  assert.match(message, /최초 실패 단계 `navigation` \/ `failed`/);
});

test("Given a malicious transport exception When notifying Then it logs only the fixed delivery code", async () => {
  const lines: string[] = [];
  const logger = pino(
    { level: "error" },
    new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    }),
  );
  const transport: EmergencyWebhookTransport = {
    async send() {
      const error = new Error(
        "secret-password https://private.example SELECT * FROM t",
      );
      error.name = "PrivateErrorName";
      throw error;
    },
  };
  const notifier = new EmergencyWebhookNotifier(
    "https://discord.com/api/webhooks/test/token",
    transport,
    logger,
  );

  assert.equal(
    await notifier.notify(incident, new AbortController().signal),
    "failed",
  );
  const output = lines.join("");
  assert.match(output, /transport_failed/);
  for (const forbidden of [
    "secret-password",
    "private.example",
    "SELECT",
    "PrivateErrorName",
  ])
    assert.equal(output.includes(forbidden), false);
});

test("Given an oversized failed cycle When formatting Then primary transaction and SQL failure facts remain within Discord's limit", () => {
  const result = new CollectorIncidentFactory().fromCycle({
    ...cycleReport,
    status: "failed",
    cycleTrace: {
      cycleId: "cycle-priority",
      durationMs: 9_999,
      transactionStatus: "rollback_failed",
      droppedEventCount: 99,
      events: [],
      firstFailure: {
        sequence: 1,
        elapsedMs: 10,
        durationMs: 7,
        stage: "db_commit",
        outcome: "failed",
        context: { submissionId: "77", errno: 1213, sqlState: "40001" },
      },
    },
    accountFailures: Array.from({ length: 20 }, (_, index) => ({
      accountId: String(index),
      mode: "incremental" as const,
      code: "failed",
    })),
    accountFailureCount: 20,
  });
  assert.ok(result);
  const message = new EmergencyAlertFormatter().format(result);
  assert.ok(message.length <= 2_000);
  assert.match(message, /rollback_failed/);
  assert.match(message, /제출 `77`/);
  assert.match(message, /SQL 상태 `40001`/);
});

test("Given same code failures with distinct trace targets When notifying Then only an identical target is suppressed for thirty minutes", async () => {
  const delivered: string[] = [];
  const notifier = new EmergencyWebhookNotifier(
    "https://example.test/webhook",
    {
      async send(_url, content) {
        delivered.push(content);
        return { kind: "delivered" as const };
      },
    },
    pino({ level: "silent" }),
  );
  const report = (target: string): CycleReport => ({
    ...cycleReport,
    status: "failed",
    cycleTrace: {
      cycleId: "cycle-dedupe",
      durationMs: 1,
      transactionStatus: "active",
      droppedEventCount: 0,
      events: [],
      firstFailure: {
        sequence: 1,
        elapsedMs: 1,
        durationMs: 1,
        stage: "submission_actor",
        outcome: "failed",
        context: { actorHandle: target },
      },
    },
  });
  const factory = new CollectorIncidentFactory();
  const at = new Date("2026-01-01T00:00:00Z");
  const first = factory.fromCycle(report("one"), at);
  const other = factory.fromCycle(report("two"), new Date(at.getTime() + 1));
  const same = factory.fromCycle(report("one"), new Date(at.getTime() + 2));
  assert.ok(first && other && same);
  assert.equal(
    await notifier.notify(first, new AbortController().signal),
    "delivered",
  );
  assert.equal(
    await notifier.notify(other, new AbortController().signal),
    "delivered",
  );
  assert.equal(
    await notifier.notify(same, new AbortController().signal),
    "suppressed",
  );
  assert.equal(delivered.length, 2);
});
