import assert from "node:assert/strict";
import test from "node:test";
import type { CycleAdapters } from "../src/application/cycle-types.js";
import { SyncCycleExecutor } from "../src/application/execute-cycle.js";
import {
  InitialSubmissionCursor,
  rankMemberSchema,
} from "../src/domain/sync.js";
import { problemIdSchema } from "../src/domain.js";

test("initial-summary worker failure leaves other baseline initialization committed", async () => {
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
      summary: async (plan) => {
        assert.equal(plan.maxPages, 1);
        if (plan.member.accountId === "2") throw new TypeError("secret");
        return [{ problemId: problemIdSchema.parse(5) }];
      },
      cursor: async () => new InitialSubmissionCursor(11n, 2),
      collect: async (plan) =>
        assert.fail(
          `unexpected incremental collection for ${plan.member.accountId}`,
        ),
      metadata: async () =>
        assert.fail("initial summary must not read metadata"),
      close: async () => {},
    }),
    persist: async () =>
      assert.fail("initial summary must not use incremental persistence"),
    initialize: async (snapshot) => {
      assert.equal(snapshot.plan.mode, "initial_summary");
      assert.equal(snapshot.highestInspectedSubmissionId, 11n);
      assert.equal(snapshot.solved.length, 1);
      events.push("initialize");
    },
    refreshMetadata: async () => {},
    project: async () => {
      events.push("project");
    },
  };
  const result = await new SyncCycleExecutor(adapters, {
    concurrency: 2,
    maxPages: 100,
  }).run(new AbortController().signal);
  assert.equal(result.status, "partial");
  assert.equal(result.failedUserCount, 1);
  assert.deepEqual(events, ["initialize", "project", "release"]);
});
