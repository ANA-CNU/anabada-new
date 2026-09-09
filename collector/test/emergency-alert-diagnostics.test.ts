import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import { pino } from "pino";
import type { CycleReport } from "../src/application/cycle-types.js";
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

  assert.match(message, /그룹 rank 기대 3 \/ 프로필 표시 10/);
  assert.match(message, /그룹 rank 기대 2 \/ 프로필 표시 5/);
  assert.match(message, /준비 대기 30000ms \/ 프로필 표시 73 \/ 목록 링크 50/);
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
  assert.match(message, /그룹 rank 기대 3 \/ 프로필 표시 10/);
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

  assert.match(message, /HTTP 상태 429/);
  assert.match(message, /전송 코드 ETIMEDOUT/);
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
