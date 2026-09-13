import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { AtomicCycleFailure } from "../src/application/cycle-atomic-error.js";
import { GroupFeedRepository } from "../src/mysql/group-feed.js";
import {
  type CheckpointRow,
  cleanup,
  firstSubmission,
  groupId,
  initialize,
  member,
  runtime,
  secondSubmission,
  state,
} from "./daily-missed-mysql-fixture.js";

export async function runDailyMissedCases(
  t: TestContext,
  pool: Pool,
): Promise<void> {
  await t.test(
    "Given tier-0 metadata followed by a corrected replay When the atomic cycle settles twice Then duplicate bypass permanently misses daily",
    async () => {
      await cleanup(pool);
      const candidate = member(9801);
      const calls = { count: 0, metadataCount: 0 };
      await initialize(pool, candidate);
      const connection = await pool.getConnection();
      try {
        await new GroupFeedRepository(connection).insertCheckpoint(
          groupId,
          "980000",
        );
      } finally {
        connection.release();
      }
      await runtime(pool, candidate, firstSubmission, 0, calls).runAtomic(
        new AbortController().signal,
      );
      assert.deepEqual(await state(pool, 9801), {
        external_submission_id: String(firstSubmission),
        problem_tier: 0,
        estimated_tier: 0,
        level: -8,
        solution: String(firstSubmission),
        daily_count: "0",
        score_day: null,
        cache_total: "0",
      });
      assert.deepEqual(calls, { count: 1, metadataCount: 1 });
      const [checkpoint] = await pool.query<CheckpointRow[]>(
        "SELECT committed_cursor,phase FROM collector_checkpoint WHERE group_id=1125",
      );
      assert.deepEqual(checkpoint[0], {
        committed_cursor: String(firstSubmission),
        phase: "idle",
      });
      const result = await runtime(
        pool,
        candidate,
        firstSubmission,
        7,
        calls,
      ).runAtomic(new AbortController().signal);
      assert.equal(result.settlement.duplicateAttemptCount, 1);
      assert.deepEqual(await state(pool, 9801), {
        external_submission_id: String(firstSubmission),
        problem_tier: 0,
        estimated_tier: 0,
        level: -8,
        solution: String(firstSubmission),
        daily_count: "0",
        score_day: null,
        cache_total: "0",
      });
      assert.deepEqual(calls, { count: 1, metadataCount: 2 });
    },
  );

  await t.test(
    "Given a separately initialized tier-8 member When metadata is tier 7 on first processing Then its original KST day receives one daily point",
    async () => {
      await cleanup(pool);
      const candidate = member(9802);
      const calls = { count: 0, metadataCount: 0 };
      await initialize(pool, candidate);
      const connection = await pool.getConnection();
      try {
        await new GroupFeedRepository(connection).insertCheckpoint(
          groupId,
          "980000",
        );
      } finally {
        connection.release();
      }
      await runtime(pool, candidate, secondSubmission, 7, calls).runAtomic(
        new AbortController().signal,
      );
      const observed = await state(pool, 9802);
      assert.deepEqual(observed, {
        external_submission_id: String(secondSubmission),
        problem_tier: 7,
        estimated_tier: 0,
        level: -1,
        solution: String(secondSubmission),
        daily_count: "1",
        score_day: "2026-09-13",
        cache_total: "1",
      });
      assert.deepEqual(calls, { count: 0, metadataCount: 1 });
    },
  );

  await t.test(
    "Given metadata preparation throws When the atomic cycle runs Then it makes no durable change, and a later valid first processing awards daily",
    async () => {
      await cleanup(pool);
      const candidate = member(9803);
      const calls = { count: 0, metadataCount: 0 };
      await initialize(pool, candidate);
      const connection = await pool.getConnection();
      try {
        await new GroupFeedRepository(connection).insertCheckpoint(
          groupId,
          "980000",
        );
      } finally {
        connection.release();
      }
      await assert.rejects(
        runtime(pool, candidate, secondSubmission, "throw", calls).runAtomic(
          new AbortController().signal,
        ),
        (error: unknown) => {
          if (!(error instanceof AtomicCycleFailure)) return false;
          const failure = error.cycleTrace.firstFailure;
          const { problemId, imageObserved } = failure?.context ?? {};
          return (
            error.cycleTrace.transactionStatus === "not_started" &&
            failure?.stage === "problem_metadata" &&
            problemId === 5498 &&
            imageObserved === true
          );
        },
      );
      const [beforeRetry] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM problem WHERE external_submission_id=?",
        [secondSubmission],
      );
      assert.deepEqual(beforeRetry[0], { total: "0" });
      const [checkpoint] = await pool.query<CheckpointRow[]>(
        "SELECT committed_cursor,phase FROM collector_checkpoint WHERE group_id=1125",
      );
      assert.deepEqual(checkpoint[0], {
        committed_cursor: "980000",
        phase: "idle",
      });
      await runtime(pool, candidate, secondSubmission, 7, calls).runAtomic(
        new AbortController().signal,
      );
      assert.equal((await state(pool, 9803)).daily_count, "1");
    },
  );
}
