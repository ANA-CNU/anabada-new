import assert from "node:assert/strict";
import test from "node:test";
import type { CycleAdapters } from "../src/application/cycle-types.js";
import { AccountFlowFailure } from "../src/application/flow-log.js";
import { AccountSyncWorker } from "../src/application/sync-account.js";
import {
  AccountSyncPlan,
  InitialSolvedProblem,
  InitialSubmissionCursor,
  rankMemberSchema,
} from "../src/domain/sync.js";
import { problemIdSchema } from "../src/domain.js";

const member = rankMemberSchema.parse({
  accountId: "148259",
  jungolName: "fixture",
  solvedCount: 2,
  wrongCount: 0,
  acRating: 0,
  tier: 0,
});

test("initial summary uses only summary and first-page cursor before initialization", async () => {
  const events: string[] = [];
  const plan = new AccountSyncPlan("initial_summary", member, 0n, 2, 1);
  const adapters: CycleAdapters = {
    lease: async () => ({ release: async () => {} }),
    login: async () => {},
    rank: async () => [member],
    stored: async () => new Map(),
    browser: async () => ({
      summary: async () => {
        events.push("summary");
        return [
          new InitialSolvedProblem(problemIdSchema.parse(1000)),
          new InitialSolvedProblem(problemIdSchema.parse(1001)),
        ];
      },
      cursor: async () => {
        events.push("cursor");
        return new InitialSubmissionCursor(9000n, 3);
      },
      collect: async () => assert.fail("initial summary must not paginate"),
      metadata: async () =>
        assert.fail("initial summary must not resolve metadata"),
      close: async () => {
        events.push("close");
      },
    }),
    persist: async () =>
      assert.fail("initial summary must not use incremental persistence"),
    initialize: async (snapshot) => {
      events.push("initialize");
      assert.equal(snapshot.highestInspectedSubmissionId, 9000n);
      assert.deepEqual(
        snapshot.solved.map((problem) => problem.problemId),
        [1000, 1001],
      );
    },
    refreshMetadata: async () => {},
    project: async () => {},
  };

  const result = await new AccountSyncWorker(
    { plan, previous: null },
    {
      adapters,
      signal: new AbortController().signal,
      refresh: async () => [member],
    },
  ).run();

  assert.deepEqual(events, ["cursor", "summary", "close", "initialize"]);
  assert.equal(result.insertedAttemptCount, 2);
  assert.equal(result.scannedCount, 3);
  assert.equal(result.acceptedCount, 0);
});

test("initial summary captures its cursor before a later solved-summary observation", async () => {
  const events: string[] = [];
  let cursorCaptured = false;
  let initializedCursor: bigint | undefined;
  const plan = new AccountSyncPlan("initial_summary", member, 0n, 2, 1);
  const adapters: CycleAdapters = {
    lease: async () => ({ release: async () => {} }),
    login: async () => {},
    rank: async () => [member],
    stored: async () => new Map(),
    browser: async () => ({
      cursor: async () => {
        events.push("cursor");
        cursorCaptured = true;
        return new InitialSubmissionCursor(9000n, 3);
      },
      summary: async () => {
        events.push("summary");
        assert.equal(cursorCaptured, true, "summary must not precede cursor");
        return [1000, 1001, 1002].map(
          (id) => new InitialSolvedProblem(problemIdSchema.parse(id)),
        );
      },
      collect: async () => assert.fail("initial summary must not paginate"),
      metadata: async () =>
        assert.fail("initial summary must not resolve metadata"),
      close: async () => {
        events.push("close");
      },
    }),
    persist: async () =>
      assert.fail("initial summary must not use incremental persistence"),
    initialize: async (snapshot) => {
      events.push("initialize");
      initializedCursor = snapshot.highestInspectedSubmissionId;
    },
    refreshMetadata: async () => {},
    project: async () => {},
  };

  await new AccountSyncWorker(
    { plan, previous: null },
    {
      adapters,
      signal: new AbortController().signal,
      refresh: async () => [member],
    },
  ).run();
  assert.deepEqual(events, ["cursor", "summary", "close", "initialize"]);
  assert.equal(initializedCursor, 9000n);
});

test("zero-solved initial summary records cursor zero without incremental calls", async () => {
  const zeroMember = rankMemberSchema.parse({
    accountId: "148260",
    jungolName: "zero",
    solvedCount: 0,
    wrongCount: 0,
    acRating: 0,
    tier: 0,
  });
  const plan = new AccountSyncPlan("initial_summary", zeroMember, 0n, 0, 1);
  let initialized = false;
  const adapters: CycleAdapters = {
    lease: async () => ({ release: async () => {} }),
    login: async () => {},
    rank: async () => [zeroMember],
    stored: async () => new Map(),
    browser: async () => ({
      summary: async () => [],
      cursor: async () => new InitialSubmissionCursor(0n, 0),
      collect: async () => assert.fail("unexpected pagination"),
      metadata: async () => assert.fail("unexpected metadata"),
      close: async () => {},
    }),
    persist: async () => assert.fail("unexpected incremental persistence"),
    initialize: async (snapshot) => {
      initialized = true;
      assert.equal(snapshot.solved.length, 0);
      assert.equal(snapshot.highestInspectedSubmissionId, 0n);
    },
    refreshMetadata: async () => {},
    project: async () => {},
  };

  const result = await new AccountSyncWorker(
    { plan, previous: null },
    {
      adapters,
      signal: new AbortController().signal,
      refresh: async () => [zeroMember],
    },
  ).run();

  assert.equal(initialized, true);
  assert.equal(result.scannedCount, 0);
  assert.equal(result.insertedAttemptCount, 0);
});

test("Given an initial summary failure and close failure When the worker rejects Then it preserves the summary failure and cursor trace", async () => {
  const plan = new AccountSyncPlan("initial_summary", member, 0n, 2, 1);
  const primary = new TypeError("summary-private-message");
  const adapters: CycleAdapters = {
    lease: async () => ({ release: async () => {} }),
    login: async () => {},
    rank: async () => [member],
    stored: async () => new Map(),
    browser: async () => ({
      cursor: async () => new InitialSubmissionCursor(9000n, 3),
      summary: async () => {
        throw primary;
      },
      collect: async () => assert.fail("initial summary must not paginate"),
      metadata: async () =>
        assert.fail("initial summary must not resolve metadata"),
      close: async () => {
        throw new Error("close-private-message");
      },
    }),
    persist: async () => assert.fail("initial summary must not persist"),
    initialize: async () => assert.fail("initial summary must not initialize"),
    refreshMetadata: async () => {},
    project: async () => {},
  };

  await assert.rejects(
    new AccountSyncWorker(
      { plan, previous: null },
      {
        adapters,
        signal: new AbortController().signal,
        refresh: async () => [member],
      },
    ).run(),
    (error: unknown) => {
      assert.ok(error instanceof AccountFlowFailure);
      assert.equal(error.cause, primary);
      assert.equal(error.trace.primaryFailure?.step, "initial_summary");
      assert.ok(
        error.trace.events.some(
          (event) =>
            event.step === "initial_cursor" && event.outcome === "completed",
        ),
      );
      assert.equal(error.trace.events.at(-1)?.step, "browser_close");
      return true;
    },
  );
});
