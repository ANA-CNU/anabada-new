import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { pino } from "pino";
import type { CycleReport } from "../src/application/cycle-types.js";
import {
  CollectorIncidentFactory,
  EmergencyAlertFormatter,
  EmergencyWebhookNotifier,
  type EmergencyWebhookTransport,
} from "../src/emergency-alert.js";
import { DiscordWebhookClient } from "../src/webhook.js";

const incident = {
  code: "rank_mismatch",
  signature: "rank_mismatch:runtime",
  occurredAt: new Date("2026-09-08T00:00:00Z"),
  impact: "일부 사용자 수집이 완료되지 않았습니다.",
  actions: [
    "collector 로그에서 같은 오류 코드를 확인하세요.",
    "DB cursor를 수동으로 전진시키지 마세요.",
  ],
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

test("Given a partial cycle When creating an incident Then exposes only operational counters", () => {
  const result = new CollectorIncidentFactory().fromCycle(
    cycleReport,
    incident.occurredAt,
  );

  assert.equal(result?.code, "rank_mismatch");
  assert.deepEqual(result?.facts, [
    "상태: `partial` / 성공: `1`명 / 실패: `1`명",
  ]);
});

test("Given a successful cycle When creating an incident Then produces no alert", () => {
  const result = new CollectorIncidentFactory().fromCycle({
    ...cycleReport,
    status: "success",
    errorCode: null,
  });

  assert.equal(result, undefined);
});

test("Given different account signatures and oversized facts When notifying Then it does not suppress distinct failures and preserves actions under 2000 characters", async () => {
  const transport = new RecordingEmergencyTransport();
  const notifier = new EmergencyWebhookNotifier(
    "https://discord.com/api/webhooks/test/token",
    transport,
    pino({ enabled: false }),
  );
  const first = { ...incident, signature: "same-code:initial_summary:1" };
  const second = { ...incident, signature: "same-code:initial_summary:2" };
  await notifier.notify(first, new AbortController().signal);
  await notifier.notify(second, new AbortController().signal);
  const oversized = new EmergencyAlertFormatter().format({
    ...incident,
    facts: Array.from({ length: 40 }, () => "x".repeat(100)),
  });

  assert.equal(transport.messages.length, 2);
  assert.ok(oversized.length <= 2_000);
  assert.match(oversized, /## 즉시 확인/);
});

test("Given a collector incident When formatting Then returns an actionable Discord Markdown alert", () => {
  const message = new EmergencyAlertFormatter().format(incident);

  assert.match(message, /^# 🚨 ANABADA 긴급 장애 알림/m);
  assert.match(message, /\*\*서비스:\*\* `jungol-collector`/);
  assert.match(message, /\*\*오류 코드:\*\* `rank_mismatch`/);
  assert.match(message, /## 즉시 확인/);
  assert.equal(message.includes("2026-09-08 09:00:00 KST"), true);
});

test("Given scalar Markdown control characters and oversized facts When formatting Then it keeps code spans intact and only includes whole fact lines", () => {
  const message = new EmergencyAlertFormatter().format({
    ...incident,
    code: "rank`mismatch\u0000\nnext\u007F",
    actions: ["JUNGOL_USERNAME과 JUNGOL_PASSWORD를 확인하세요."],
    facts: ["완전한 사실 `one`", "x".repeat(2_000)],
  });

  assert.match(message, /\*\*오류 코드:\*\* `rankˋmismatch {2}next`/);
  assert.match(message, /`JUNGOL_USERNAME`과 `JUNGOL_PASSWORD`를 확인하세요\./);
  assert.match(message, /- 완전한 사실 `one`/);
  assert.equal(message.includes("x".repeat(2_000)), false);
  assert.equal(message.length <= 2_000, true);
  assert.equal((message.match(/`/g) ?? []).length % 2, 0);
});

test("Given no emergency URL When notifying Then performs no delivery", async () => {
  const transport = new RecordingEmergencyTransport();
  const notifier = new EmergencyWebhookNotifier(
    undefined,
    transport,
    pino({ enabled: false }),
  );

  const result = await notifier.notify(incident, new AbortController().signal);

  assert.equal(result, "disabled");
  assert.equal(transport.messages.length, 0);
});

test("Given repeated identical incidents When notifying Then suppresses the duplicate after delivery", async () => {
  const transport = new RecordingEmergencyTransport();
  const notifier = new EmergencyWebhookNotifier(
    "https://discord.com/api/webhooks/test/token",
    transport,
    pino({ enabled: false }),
  );

  const first = await notifier.notify(incident, new AbortController().signal);
  const second = await notifier.notify(incident, new AbortController().signal);

  assert.equal(first, "delivered");
  assert.equal(second, "suppressed");
  assert.equal(transport.messages.length, 1);
});

test("Given an emergency endpoint When notifying Then posts the Markdown payload", async (t) => {
  let received = "";
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      received += chunk;
    });
    request.on("end", () => response.writeHead(204).end());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const notifier = new EmergencyWebhookNotifier(
    `http://127.0.0.1:${address.port}/incident`,
    new DiscordWebhookClient(1_000),
    pino({ enabled: false }),
  );
  const tracedIncident = new CollectorIncidentFactory().fromCycle({
    ...cycleReport,
    errorCode: "account_summary_invalid",
    accountFailureCount: 1,
    accountFailures: [
      {
        accountId: "42",
        mode: "initial_summary",
        code: "account_summary_invalid",
        trace: {
          droppedEventCount: 0,
          events: [
            {
              sequence: 1,
              elapsedMs: 0,
              step: "initial_summary",
              outcome: "started",
            },
            {
              sequence: 2,
              elapsedMs: 1,
              step: "initial_summary",
              outcome: "failed",
              errorKind: "type_error",
            },
          ],
          primaryFailure: {
            sequence: 2,
            elapsedMs: 1,
            step: "initial_summary",
            outcome: "failed",
            errorKind: "type_error",
          },
        },
      },
    ],
  });
  assert.ok(tracedIncident);

  const result = await notifier.notify(
    tracedIncident,
    new AbortController().signal,
  );

  assert.equal(result, "delivered");
  assert.deepEqual(JSON.parse(received), {
    content: new EmergencyAlertFormatter().format(tracedIncident),
    allowed_mentions: { parse: [] },
  });
  assert.match(
    new EmergencyAlertFormatter().format(tracedIncident),
    /최초 실패 단계 `initial_summary`[\s\S]*최근 흐름 `initial_summary:failed@1ms:type_error`/,
  );
});

class RecordingEmergencyTransport implements EmergencyWebhookTransport {
  readonly messages: string[] = [];

  async send(
    _url: string,
    content: string,
    _signal: AbortSignal,
  ): Promise<{ readonly kind: "delivered" }> {
    this.messages.push(content);
    return { kind: "delivered" };
  }
}
