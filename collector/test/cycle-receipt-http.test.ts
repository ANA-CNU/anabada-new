import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { pino } from "pino";
import { z } from "zod";
import type { CycleReport } from "../src/application/cycle-types.js";
import {
  CycleLifecycleReporter,
  type CycleLifecycleTimer,
} from "../src/cycle-lifecycle-reporter.js";
import { DiscordWebhookClient } from "../src/webhook.js";

const receiptSchema = z.object({
  allowed_mentions: z.object({ parse: z.array(z.string()).length(0) }),
  content: z.string().max(2_000),
});

const report: CycleReport = {
  status: "success",
  rankCount: 3,
  syncUserCount: 2,
  metadataUserCount: 0,
  successUserCount: 2,
  failedUserCount: 0,
  scannedAttemptCount: 8,
  acceptedAttemptCount: 6,
  insertedAttemptCount: 4,
  duplicateAttemptCount: 2,
  errorCode: null,
  accountFailureCount: 0,
  accountFailures: [],
  commonFailures: [],
  pending: true,
};

test("Given a successful pending cycle When its receipt is delivered Then the Discord wire payload disables mentions and preserves receipt facts", async (t) => {
  let received = "";
  let method = "";
  const server = createServer((request, response) => {
    method = request.method ?? "";
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

  const reporter = new CycleLifecycleReporter({
    url: `http://127.0.0.1:${address.port}/receipt`,
    transport: new DiscordWebhookClient(1_000),
    logger: pino({ enabled: false }),
    timer: new FakeTimer(),
  });

  const started = reporter.start(new Date("2026-09-10T00:00:00Z"));
  await reporter.complete(started, report, new Date("2026-09-10T00:01:05Z"));

  assert.equal(method, "POST");
  const receipt = receiptSchema.parse(JSON.parse(received));
  assert.match(receipt.content, /ANABADA collector 정상 완료/);
  assert.match(receipt.content, /상태: `success_pending`/);
  assert.match(receipt.content, /삽입 AC: `4`건/);
  assert.match(receipt.content, /중복 AC: `2`건/);
  assert.match(receipt.content, /정산 성공 사용자: `2`명/);
  assert.match(receipt.content, /실행 시간: `1분 5초`/);
});

class FakeTimer implements CycleLifecycleTimer {
  set(_milliseconds: number, _callback: () => void): () => void {
    return () => {};
  }
}
