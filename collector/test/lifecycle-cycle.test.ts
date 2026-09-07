import assert from "node:assert/strict";
import test from "node:test";
import type { CycleAdapters } from "../src/application/cycle-types.js";
import { SyncCycleExecutor } from "../src/application/execute-cycle.js";
import { rankMemberSchema } from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";

test("filters AC while advancing rejected cursor and projects after partial workers", async () => {
  const events: string[] = [];
  const members = [1, 2].map((id) =>
    rankMemberSchema.parse({
      accountId: String(id),
      jungolName: "private",
      solvedCount: 1,
      wrongCount: 1,
      acRating: 2,
      tier: 0,
    }),
  );
  const adapters: CycleAdapters = {
    lease: async () => ({
      release: async () => {
        events.push("release");
      },
    }),
    login: async () => {},
    rank: async () => members,
    stored: async () => new Map(),
    browser: async () => ({
      collect: async (plan) => {
        assert.equal(plan.maxPages, 1000);
        if (plan.member.accountId === "2") throw new TypeError("secret");
        return {
          attempts: ["accepted", "wrong_answer"].map((verdict, index) => ({
            submissionId: submissionIdSchema.parse(10 + index),
            problemId: problemIdSchema.parse(5),
            verdict: verdict === "accepted" ? "accepted" : "wrong_answer",
            score: 100,
            submittedAt: new Date(0),
          })),
          highestInspectedId: 11n,
          pageCount: 1,
          cursorReached: true,
        };
      },
      metadata: async (id) => ({ problemId: id, title: "title", tier: 3 }),
      close: async () => {},
    }),
    persist: async (input) => {
      assert.equal(input.acceptedAttempts.length, 1);
      assert.equal(input.highestInspectedSubmissionId, 11n);
      assert.equal(input.plan.member.acRating, 2);
      events.push("persist");
      return {
        insertedAttemptCount: 1,
        duplicateAttemptCount: 0,
        newSolvedCount: 1,
      };
    },
    refreshMetadata: async () => {},
    project: async () => {
      events.push("project");
    },
  };
  const result = await new SyncCycleExecutor(adapters, {
    concurrency: 2,
    maxPages: 100,
    initialBackfillMaxPages: 1000,
  }).run(new AbortController().signal);
  assert.equal(result.status, "partial");
  assert.equal(result.failedUserCount, 1);
  assert.deepEqual(events, ["persist", "project", "release"]);
});
