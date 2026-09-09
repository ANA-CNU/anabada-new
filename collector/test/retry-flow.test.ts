import assert from "node:assert/strict";
import test from "node:test";
import type {
  AccountBrowser,
  CycleAdapters,
} from "../src/application/cycle-types.js";
import { SyncCycleExecutor } from "../src/application/execute-cycle.js";
import { rankMemberSchema } from "../src/domain/sync.js";
import {
  type ProblemId,
  problemIdSchema,
  submissionIdSchema,
} from "../src/domain.js";
import type { ProblemMetadata } from "../src/jungol/metadata.js";
import type { CollectedSubmissions } from "../src/jungol/submission.js";
import { PersistenceError } from "../src/mysql/account-types.js";

const member = rankMemberSchema.parse({
  accountId: "1",
  jungolName: "fixture",
  solvedCount: 1,
  wrongCount: 0,
  acRating: 0,
  tier: 0,
});

class FakeAccountBrowser implements AccountBrowser {
  constructor(
    private readonly events: string[],
    private readonly attempts: CollectedSubmissions["attempts"] = [],
    private readonly metadataResult: (
      problemId: ProblemId,
    ) => ProblemMetadata | Error = (problemId) => ({
      problemId,
      title: "fixture",
      tier: 0,
    }),
  ) {}

  async summary(): Promise<never> {
    return assert.fail("unexpected initial summary");
  }

  async cursor(): Promise<never> {
    return assert.fail("unexpected initial cursor");
  }

  async collect(): Promise<CollectedSubmissions> {
    return {
      attempts: this.attempts,
      highestInspectedId: 101n,
      pageCount: 1,
      cursorReached: true as const,
    };
  }

  async metadata(problemId: ProblemId): Promise<ProblemMetadata> {
    const result = this.metadataResult(problemId);
    if (result instanceof Error) throw result;
    return result;
  }

  async close(): Promise<void> {
    this.events.push("closed");
  }
}

const fixture = (): {
  readonly adapters: CycleAdapters;
  readonly events: string[];
} => {
  const events: string[] = [];
  return {
    events,
    adapters: {
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
      browser: async () => new FakeAccountBrowser(events),
      persist: async () => ({
        insertedAttemptCount: 0,
        duplicateAttemptCount: 0,
        newSolvedCount: 0,
      }),
      initialize: async () => assert.fail("unexpected initialization"),
      refreshMetadata: async () => assert.fail("unexpected metadata refresh"),
      project: async () => {
        events.push("project");
      },
    },
  };
};

test("Given a rank mismatch followed by a successful retry When the worker completes Then the cycle has no incident failure", async () => {
  const { adapters, events } = fixture();
  let attempts = 0;
  const summary = await new SyncCycleExecutor(
    {
      ...adapters,
      persist: async () => {
        events.push("persist");
        attempts += 1;
        if (attempts === 1) throw new PersistenceError("rank_mismatch");
        return {
          insertedAttemptCount: 0,
          duplicateAttemptCount: 0,
          newSolvedCount: 0,
        };
      },
    },
    { concurrency: 2, maxPages: 10 },
  ).run(new AbortController().signal);

  assert.equal(summary.status, "success");
  assert.equal(summary.errorCode, null);
  assert.equal(summary.accountFailureCount, 0);
  assert.deepEqual(summary.accountFailures, []);
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

test("Given a rank mismatch followed by metadata failure When the worker rejects Then it retains the terminal metadata trace and prior persistence history", async () => {
  const { adapters, events } = fixture();
  let metadataAttempts = 0;
  const summary = await new SyncCycleExecutor(
    {
      ...adapters,
      browser: async () =>
        new FakeAccountBrowser(
          events,
          [
            {
              submissionId: submissionIdSchema.parse(101),
              problemId: problemIdSchema.parse(1),
              verdict: "accepted",
              score: 100,
              submittedAt: new Date("2026-09-09T00:00:00Z"),
            },
          ],
          (problemId) => {
            metadataAttempts += 1;
            return metadataAttempts === 2
              ? new TypeError("private metadata")
              : { problemId, title: "fixture", tier: 0 };
          },
        ),
      persist: async () => {
        events.push("persist");
        throw new PersistenceError("rank_mismatch");
      },
    },
    { concurrency: 2, maxPages: 10 },
  ).run(new AbortController().signal);

  const [failure] = summary.accountFailures;
  assert.equal(summary.status, "partial");
  assert.equal(summary.errorCode, "internal_error");
  assert.equal(failure?.code, "internal_error");
  assert.equal(failure?.trace?.primaryFailure?.step, "metadata");
  assert.ok(
    failure?.trace?.events.some(
      (event) => event.step === "db_persist" && event.outcome === "failed",
    ),
  );
  assert.equal(failure?.trace?.events.at(-1)?.step, "browser_close");
  assert.equal(failure?.trace?.events.at(-1)?.outcome, "completed");
  assert.equal(metadataAttempts, 2);
  assert.deepEqual(events, [
    "rank",
    "closed",
    "persist",
    "rank",
    "closed",
    "project",
    "release",
  ]);
});
