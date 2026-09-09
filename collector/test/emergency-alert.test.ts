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
};

test("Given a partial cycle When creating an incident Then exposes only operational counters", () => {
  const result = new CollectorIncidentFactory().fromCycle(
    cycleReport,
    incident.occurredAt,
  );

  assert.equal(result?.code, "rank_mismatch");
  assert.deepEqual(result?.facts, ["상태: partial / 성공: 1명 / 실패: 1명"]);
});

test("Given a successful cycle When creating an incident Then produces no alert", () => {
  const result = new CollectorIncidentFactory().fromCycle({
    ...cycleReport,
    status: "success",
    errorCode: null,
  });

  assert.equal(result, undefined);
});

test("Given a collector incident When formatting Then returns an actionable Discord Markdown alert", () => {
  const message = new EmergencyAlertFormatter().format(incident);

  assert.match(message, /^# 🚨 ANABADA 긴급 장애 알림/m);
  assert.match(message, /\*\*서비스:\*\* `jungol-collector`/);
  assert.match(message, /\*\*오류 코드:\*\* `rank_mismatch`/);
  assert.match(message, /## 즉시 확인/);
  assert.equal(message.includes("2026-09-08 09:00:00 KST"), true);
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

  const result = await notifier.notify(incident, new AbortController().signal);

  assert.equal(result, "delivered");
  assert.deepEqual(JSON.parse(received), {
    content: new EmergencyAlertFormatter().format(incident),
  });
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
