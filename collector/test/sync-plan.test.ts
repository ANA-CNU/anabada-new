import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { rankMemberSchema } from "../src/domain/sync.js";
import { SyncPlanner } from "../src/sync-plan.js";
import { AccountWorkerPool } from "../src/worker-pool.js";

const planner = new SyncPlanner({ maxPages: 2 });

test("Given a new rank member When planning Then summary initialization starts at zero", () => {
  const member = rankMemberSchema.parse({
    accountId: "42",
    jungolName: "member",
    solvedCount: 3,
    wrongCount: 2,
    acRating: 10,
    tier: 0,
  });
  const result = planner.plan(member, null);
  assert.equal(result.kind, "initial_summary");
  if (result.kind === "initial_summary") {
    assert.equal(result.plan.cursorBefore, 0n);
    assert.equal(result.plan.expectedSolvedDelta, 3);
    assert.equal(result.plan.maxPages, 1);
  }
});
test("Given fewer solved problems When planning Then regression is explicit", () => {
  const member = rankMemberSchema.parse({
    accountId: "42",
    jungolName: "member",
    solvedCount: 3,
    wrongCount: 2,
    acRating: 10,
    tier: 0,
  });
  const result = planner.plan(member, {
    solvedCount: 4,
    lastSubmissionId: 100n,
  });
  assert.equal(result.kind, "rank_regression");
});
test("Given failing and successful jobs When pooled Then failures remain isolated", async () => {
  const results = await new AccountWorkerPool(2).run(
    [1, 2, 3],
    new AbortController().signal,
    async (value) => {
      if (value === 2) throw new RangeError("fixture");
      return value * 2;
    },
  );
  assert.deepEqual(
    results.map((result) => result.kind),
    ["success", "failure", "success"],
  );
});

test("Given blocked jobs When pooled Then only the concurrency bound starts", async () => {
  let active = 0;
  let peak = 0;
  const releases: (() => void)[] = [];
  const resultPromise = new AccountWorkerPool(2).run(
    [1, 2, 3, 4],
    new AbortController().signal,
    async (value) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return value;
    },
  );
  assert.equal(releases.length, 2);
  for (const release of releases.splice(0)) release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  for (const release of releases.splice(0)) release();
  const results = await resultPromise;
  assert.equal(peak, 2);
  assert.equal(results.length, 4);
});

test("Given cancellation When pooled Then no job starts", async () => {
  let started = 0;
  const results = await new AccountWorkerPool(2).run(
    [1, 2],
    AbortSignal.abort(),
    async () => ++started,
  );
  assert.equal(started, 0);
  assert.deepEqual(
    results.map((result) => result.kind),
    ["failure", "failure"],
  );
});

test(
  "Given an active cooperative worker When cancelled Then settled results survive and queued jobs never start",
  { timeout: 2000 },
  async () => {
    const controller = new AbortController();
    const started: number[] = [];
    let announceStarted = () => {};
    const activeStarted = new Promise<void>((resolve) => {
      announceStarted = resolve;
    });
    const pending = new AccountWorkerPool(1).run(
      [1, 2, 3],
      controller.signal,
      async (job: number, _index: number, signal: AbortSignal) => {
        started.push(job);
        if (job === 1) return "completed";
        announceStarted();
        assert.equal(signal, controller.signal);
        await delay(60_000, undefined, { signal });
        return "unexpected";
      },
    );
    await activeStarted;
    controller.abort();
    const results = await pending;
    assert.deepEqual(started, [1, 2]);
    assert.deepEqual(results[0], { kind: "success", value: "completed" });
    assert.equal(results[1]?.kind, "failure");
    assert.equal(results[2]?.kind, "failure");
    if (results[1]?.kind === "failure")
      assert.equal(results[1].error.name, "AbortError");
  },
);
