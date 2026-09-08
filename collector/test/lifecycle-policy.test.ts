import assert from "node:assert/strict";
import test from "node:test";
import type { CycleAdapters } from "../src/application/cycle-types.js";
import { SyncCycleExecutor } from "../src/application/execute-cycle.js";
import { rankMemberSchema } from "../src/domain/sync.js";
import { JungolError } from "../src/jungol/errors.js";
import { PersistenceError } from "../src/mysql/account-types.js";

const member = rankMemberSchema.parse({
  accountId: "1",
  jungolName: "private",
  solvedCount: 1,
  wrongCount: 0,
  acRating: 0,
  tier: 0,
});
const options = { concurrency: 2, maxPages: 10 };
function fixture() {
  const events: string[] = [];
  const adapters: CycleAdapters = {
    lease: async () => ({
      release: async () => {
        events.push("release");
      },
    }),
    login: async () => {},
    rank: async () => {
      events.push("rank");
      return [member];
    },
    stored: async () =>
      new Map([["1", { solvedCount: 0, lastSubmissionId: 0n }]]),
    browser: async () => ({
      summary: async () => assert.fail("unexpected initial summary"),
      cursor: async () => assert.fail("unexpected initial cursor"),
      collect: async () => ({
        attempts: [],
        highestInspectedId: 0n,
        pageCount: 1,
        cursorReached: true,
      }),
      metadata: async (id) => ({ problemId: id, title: "fallback", tier: 0 }),
      close: async () => {
        events.push("closed");
      },
    }),
    persist: async () => {
      events.push("persist");
      return {
        insertedAttemptCount: 0,
        duplicateAttemptCount: 0,
        newSolvedCount: 0,
      };
    },
    initialize: async () => assert.fail("unexpected initial initialization"),
    refreshMetadata: async () => {
      events.push("metadata");
    },
    project: async () => {
      events.push("project");
    },
  };
  return { adapters, events };
}
test("lease contention performs no collection or persistence", async () => {
  const { adapters, events } = fixture();
  const summary = await new SyncCycleExecutor(
    { ...adapters, lease: async () => null },
    options,
  ).run(new AbortController().signal);
  assert.equal(summary.status, "skipped_overlap");
  assert.deepEqual(events, []);
});
test("rank regression never writes account state", async () => {
  const { adapters, events } = fixture();
  const summary = await new SyncCycleExecutor(
    {
      ...adapters,
      stored: async () =>
        new Map([["1", { solvedCount: 2, lastSubmissionId: 12n }]]),
    },
    options,
  ).run(new AbortController().signal);
  assert.equal(summary.status, "partial");
  assert.equal(summary.errorCode, "rank_regression");
  assert.equal(events.includes("persist"), false);
});
test("unchanged solved count refreshes metadata without opening submissions", async () => {
  const { adapters, events } = fixture();
  const summary = await new SyncCycleExecutor(
    {
      ...adapters,
      stored: async () =>
        new Map([["1", { solvedCount: 1, lastSubmissionId: 12n }]]),
      browser: async () => assert.fail("unexpected submission browser"),
    },
    options,
  ).run(new AbortController().signal);
  assert.equal(summary.status, "success");
  assert.equal(summary.metadataUserCount, 1);
  assert.deepEqual(events, ["rank", "metadata", "project", "release"]);
});
test("auth failure returns auth_required without empty success or projection", async () => {
  const { adapters, events } = fixture();
  const summary = await new SyncCycleExecutor(
    {
      ...adapters,
      login: async () => {
        throw new JungolError("login_failed");
      },
    },
    options,
  ).run(new AbortController().signal);
  assert.equal(summary.status, "auth_required");
  assert.deepEqual(events, ["release"]);
});
test("rank mismatch performs exactly one refresh and retry after browser closes", async () => {
  const { adapters, events } = fixture();
  let attempts = 0;
  const summary = await new SyncCycleExecutor(
    {
      ...adapters,
      persist: async () => {
        events.push("persist");
        attempts++;
        throw new PersistenceError("rank_mismatch");
      },
    },
    options,
  ).run(new AbortController().signal);
  assert.equal(summary.failedUserCount, 1);
  assert.equal(attempts, 2);
  assert.deepEqual(events, [
    "rank",
    "closed",
    "persist",
    "rank",
    "closed",
    "persist",
    "project",
    "release",
  ]);
});
test("cancelled workers settle and skip projection", async () => {
  const { adapters, events } = fixture();
  const controller = new AbortController();
  const summary = await new SyncCycleExecutor(
    {
      ...adapters,
      persist: async (input) => {
        controller.abort();
        input.signal?.throwIfAborted();
        return {
          insertedAttemptCount: 0,
          duplicateAttemptCount: 0,
          newSolvedCount: 0,
        };
      },
    },
    options,
  ).run(controller.signal);
  assert.equal(summary.status, "failed");
  assert.equal(events.includes("project"), false);
  assert.equal(events.at(-1), "release");
});
