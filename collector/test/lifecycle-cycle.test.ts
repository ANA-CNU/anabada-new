import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import { pino } from "pino";
import { z } from "zod";
import type { CycleAdapters } from "../src/application/cycle-types.js";
import { SyncCycleExecutor } from "../src/application/execute-cycle.js";
import {
  InitialSubmissionCursor,
  rankMemberSchema,
} from "../src/domain/sync.js";
import { problemIdSchema } from "../src/domain.js";
import { CollectorIncidentFactory } from "../src/emergency-alert.js";
import { JungolError } from "../src/jungol/errors.js";

test("initial-summary worker failure leaves other baseline initialization committed", async () => {
  const events: string[] = [];
  const lines: string[] = [];
  const logger = pino(
    { level: "warn" },
    new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    }),
  );
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
        if (plan.member.accountId === "2")
          throw new JungolError("account_summary_mismatch", {
            stage: "account_summary",
            reason: "mismatch",
            rankSolvedCount: 1,
            profileSolvedCount: 3,
            observedLinkCount: 3,
            distinctLinkCount: 3,
            expectedCount: 1,
          });
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
    logger,
  }).run(new AbortController().signal);
  assert.equal(result.status, "partial");
  assert.equal(result.failedUserCount, 1);
  const [accountFailure] = result.accountFailures;
  assert.equal(accountFailure?.accountId, "2");
  assert.equal(accountFailure?.mode, "initial_summary");
  assert.equal(accountFailure?.code, "account_summary_mismatch");
  assert.deepEqual(accountFailure?.diagnostics, {
    stage: "account_summary",
    reason: "mismatch",
    rankSolvedCount: 1,
    profileSolvedCount: 3,
    observedLinkCount: 3,
    distinctLinkCount: 3,
    expectedCount: 1,
  });
  assert.equal(accountFailure?.trace?.primaryFailure?.step, "initial_summary");
  assert.equal(accountFailure?.trace?.events.at(-1)?.outcome, "completed");
  const alert = new CollectorIncidentFactory().fromCycle(
    result,
    new Date("2026-09-08T00:00:00Z"),
  );
  assert.ok(alert);
  assert.match(alert.facts.join("\n"), /그룹 rank 기대 `1` \/ 프로필 표시 `3`/);
  assert.deepEqual(events, ["initialize", "project", "release"]);
  const failure = lines
    .map((line) =>
      z
        .object({
          accountId: z.string(),
          rankSolvedCount: z.number(),
          phase: z.string(),
          code: z.string(),
          diagnostics: z.object({
            stage: z.string(),
            reason: z.string(),
            rankSolvedCount: z.number(),
            profileSolvedCount: z.number(),
            observedLinkCount: z.number(),
            distinctLinkCount: z.number(),
            expectedCount: z.number(),
          }),
          msg: z.string(),
        })
        .safeParse(JSON.parse(line)),
    )
    .find(
      (parsed) => parsed.success && parsed.data.msg === "account sync failed",
    );
  assert.ok(failure?.success);
  assert.deepEqual(failure.data, {
    accountId: "2",
    rankSolvedCount: 1,
    phase: "initial_summary",
    code: "account_summary_mismatch",
    diagnostics: {
      stage: "account_summary",
      reason: "mismatch",
      rankSolvedCount: 1,
      profileSolvedCount: 3,
      observedLinkCount: 3,
      distinctLinkCount: 3,
      expectedCount: 1,
    },
    msg: "account sync failed",
  });
});
