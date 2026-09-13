import assert from "node:assert/strict";
import test from "node:test";
import { pino } from "pino";
import { CycleTrace } from "../src/application/cycle-diagnostics.js";
import type { CycleReport } from "../src/application/cycle-types.js";
import { CycleLifecycleReporter } from "../src/cycle-lifecycle-reporter.js";

const success: CycleReport = {
  status: "success",
  rankCount: 16,
  syncUserCount: 2,
  metadataUserCount: 0,
  successUserCount: 2,
  failedUserCount: 0,
  scannedAttemptCount: 40,
  acceptedAttemptCount: 40,
  insertedAttemptCount: 3,
  duplicateAttemptCount: 2,
  errorCode: null,
  accountFailureCount: 0,
  accountFailures: [],
  commonFailures: [],
};

for (const overflow of [false, true]) {
  test(`successful receipt excludes diagnostic timings (overflow=${overflow})`, async () => {
    // Given: 실제 trace 버퍼에 여러 요청의 완료 기록을 누적한다.
    let now = 0;
    const trace = new CycleTrace("receipt-fixture", () => now);
    const messages: string[] = [];
    const reporter = new CycleLifecycleReporter({
      url: "https://example.invalid/webhook",
      logger: pino({ enabled: false }),
      timer: { set: () => () => {} },
      transport: {
        send: async (_url, content) => {
          messages.push(content);
          return { kind: "delivered" };
        },
      },
    });
    const active = reporter.start({ cycleId: "receipt-fixture", trace });
    for (let index = 0; index < (overflow ? 90 : 2); index++) {
      await trace.run(
        "submission_response_wait",
        { actorHandle: "private-fixture", count: 40 },
        async () => {
          now += 125;
        },
      );
    }
    trace.progressUpdate({ scannedPageCount: 2 });
    trace.transaction("committed");
    await trace.run("transaction_commit", {}, async () => {
      now += 10;
    });

    // When: 정상 완료 경로가 같은 trace를 사용해 전송한다.
    await reporter.complete(active, success);
    trace.dispose();

    // Then: 업무 결과 요약은 진단 trace를 노출하지 않는다.
    const message = messages[0] ?? "";
    assert.equal(messages.length, 1);
    assert.match(message, /`committed`/);
    assert.doesNotMatch(message, /submission_response_wait/);
    assert.doesNotMatch(message, /transaction_commit/);
    assert.doesNotMatch(message, /private-fixture/);
    assert.ok(message.length <= 2000);
    for (const line of message.split("\n"))
      assert.equal((line.match(/`/g) ?? []).length % 2, 0);
    assert.equal(trace.snapshot().events.length, 0);
  });
}

test("failed or overlapping cycles never receive a success receipt", async () => {
  // Given: 성공 알림 전용 reporter를 구성한다.
  const messages: string[] = [];
  const reporter = new CycleLifecycleReporter({
    url: "https://example.invalid/webhook",
    logger: pino({ enabled: false }),
    timer: { set: () => () => {} },
    transport: {
      send: async (_url, content) => {
        messages.push(content);
        return { kind: "delivered" };
      },
    },
  });
  // When: 실패 또는 중복 실행 제외 결과를 완료 처리한다.
  for (const status of ["failed", "skipped_overlap"] as const)
    await reporter.complete(reporter.start(), { ...success, status });
  // Then: 정상 완료로 오인할 메시지를 보내지 않는다.
  assert.equal(messages.length, 0);
});
