import assert from "node:assert/strict";
import test from "node:test";
import { pino } from "pino";
import type { CycleReport } from "../src/application/cycle-types.js";
import {
  CycleLifecycleReporter,
  type CycleLifecycleTimer,
} from "../src/cycle-lifecycle-reporter.js";

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
  pending: false,
};

test("Given a cycle below twenty minutes When it completes Then it sends only a normal receipt", async () => {
  const timer = new FakeTimer();
  const sent: string[] = [];
  const reporter = new CycleLifecycleReporter({
    url: "https://example.test/webhook",
    transport: new RecordingTransport(sent),
    logger: pino({ enabled: false }),
    timer,
  });

  const started = reporter.start(new Date("2026-09-10T00:00:00Z"));
  await timer.advance(1_199_999);
  await reporter.complete(started, report, new Date("2026-09-10T00:19:59Z"));

  assert.equal(timer.pendingCount, 0);
  assert.equal(sent.length, 1);
  assert.match(sent[0] ?? "", /정상 완료/);
  assert.match(sent[0] ?? "", /삽입 AC: `4`건/);
  assert.match(sent[0] ?? "", /정산 성공 사용자: `2`명/);
});

test("Given a running cycle at twenty minutes When the timer fires Then it alerts once and completion clears its timer", async () => {
  const timer = new FakeTimer();
  const sent: string[] = [];
  const reporter = new CycleLifecycleReporter({
    url: "https://example.test/webhook",
    transport: new RecordingTransport(sent),
    logger: pino({ enabled: false }),
    timer,
    stage: () => "group_scan",
  });

  const started = reporter.start(new Date("2026-09-10T00:00:00Z"));
  await timer.advance(1_199_999);
  assert.equal(sent.length, 0);
  await timer.advance(1);
  await timer.advance(1);
  await reporter.complete(
    started,
    { ...report, pending: true },
    new Date("2026-09-10T00:20:01Z"),
  );

  assert.equal(sent.length, 2);
  assert.match(sent[0] ?? "", /20분 이상/);
  assert.match(sent[0] ?? "", /현재 단계: `group_scan`/);
  assert.match(sent[1] ?? "", /상태: `success_pending`/);
  assert.equal(timer.pendingCount, 0);
});

test("Given an unavailable transport When reporting Then delivery failure never changes the cycle result", async () => {
  const timer = new FakeTimer();
  const reporter = new CycleLifecycleReporter({
    url: "https://example.test/webhook",
    transport: {
      send: async () => {
        throw new Error("offline");
      },
    },
    logger: pino({ enabled: false }),
    timer,
  });
  const started = reporter.start(new Date("2026-09-10T00:00:00Z"));

  await reporter.complete(started, report, new Date("2026-09-10T00:01:00Z"));

  assert.equal(timer.pendingCount, 0);
});

test("Given no actual changes When a successful cycle completes Then it still receives one normal receipt", async () => {
  const timer = new FakeTimer();
  const messages: string[] = [];
  const reporter = new CycleLifecycleReporter({
    url: "https://example.test/webhook",
    transport: new RecordingTransport(messages),
    logger: pino({ enabled: false }),
    timer,
  });
  const started = reporter.start(new Date("2026-09-10T00:00:00Z"));

  await reporter.complete(
    started,
    { ...report, insertedAttemptCount: 0, duplicateAttemptCount: 0 },
    new Date("2026-09-10T00:01:00Z"),
  );

  assert.equal(messages.length, 1);
  assert.match(messages[0] ?? "", /삽입 AC: `0`건/);
});

test("Given a stopped cycle or disabled URL When a slow timer would fire Then it sends no alert", async () => {
  const timer = new FakeTimer();
  const messages: string[] = [];
  const reporter = new CycleLifecycleReporter({
    url: undefined,
    transport: new RecordingTransport(messages),
    logger: pino({ enabled: false }),
    timer,
  });
  const started = reporter.start(new Date("2026-09-10T00:00:00Z"));

  await reporter.stop(started);
  await timer.advance(1_200_000);

  assert.equal(messages.length, 0);
  assert.equal(timer.pendingCount, 0);
});

test("Given two successful cycles When each completes Then neither receipt is suppressed", async () => {
  const timer = new FakeTimer();
  const messages: string[] = [];
  const reporter = new CycleLifecycleReporter({
    url: "https://example.test/webhook",
    transport: new RecordingTransport(messages),
    logger: pino({ enabled: false }),
    timer,
  });
  const first = reporter.start(new Date("2026-09-10T00:00:00Z"));
  const second = reporter.start(new Date("2026-09-10T00:10:00Z"));

  await reporter.complete(first, report, new Date("2026-09-10T00:01:00Z"));
  await reporter.complete(second, report, new Date("2026-09-10T00:11:00Z"));

  assert.equal(messages.length, 2);
});

test("Given untrusted display values When formatting Then every value is inline code and the message stays within Discord's limit", async () => {
  const timer = new FakeTimer();
  const sent: string[] = [];
  const reporter = new CycleLifecycleReporter({
    url: "https://example.test/webhook",
    transport: new RecordingTransport(sent),
    logger: pino({ enabled: false }),
    timer,
    stage: () => "step`\n".repeat(800),
  });
  const started = reporter.start(new Date("2026-09-10T00:00:00Z"));
  await timer.advance(1_200_000);
  reporter.stop(started);

  assert.ok((sent[0]?.length ?? 0) <= 2_000);
  for (const line of (sent[0] ?? "").split("\n"))
    assert.equal((line.match(/`/g) ?? []).length % 2, 0);
});

class FakeTimer implements CycleLifecycleTimer {
  private scheduled:
    | { readonly at: number; readonly callback: () => void }
    | undefined;
  private now = 0;

  get pendingCount(): number {
    return this.scheduled ? 1 : 0;
  }

  async advance(milliseconds: number): Promise<void> {
    this.now += milliseconds;
    const scheduled = this.scheduled;
    if (scheduled && scheduled.at <= this.now) {
      this.scheduled = undefined;
      scheduled.callback();
    }
    await Promise.resolve();
  }

  set(milliseconds: number, callback: () => void): () => void {
    this.scheduled = { at: this.now + milliseconds, callback };
    return () => {
      this.scheduled = undefined;
    };
  }
}

class RecordingTransport {
  constructor(private readonly messages: string[]) {}

  async send(
    _url: string,
    content: string,
  ): Promise<{ readonly kind: "delivered" }> {
    this.messages.push(content);
    return { kind: "delivered" };
  }
}
