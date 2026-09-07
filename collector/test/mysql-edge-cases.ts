import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  AccountSyncService,
  type PersistAccountInput,
} from "../src/account-sync.js";
import { MetadataRefreshService } from "../src/application/metadata-refresh.js";
import {
  AccountSyncPlan,
  rankMemberSchema,
  type SyncMode,
} from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";
import { AccountUnitOfWork } from "../src/mysql/unit-of-work.js";
import { UserRepository } from "../src/mysql/users.js";
import { ProjectionService } from "../src/projection.js";
import { KstCalendar } from "../src/scoring/daily.js";
import { WeightedRankingPolicy } from "../src/scoring/ranking.js";

interface CountRow extends RowDataPacket {
  readonly total: string;
}
interface RepetitionRow extends RowDataPacket {
  readonly repeatation: number;
}
interface SubmissionCountRow extends RowDataPacket {
  readonly submissions: number;
  readonly persisted: string;
}
interface MetadataRow extends RowDataPacket {
  readonly jungol_name: string;
  readonly rank_wrong_count: number;
  readonly ac_rating: number;
  readonly tier: number;
  readonly corrects: number;
  readonly submissions: number;
  readonly solution: string;
  readonly korean_name: string;
  readonly ignored: number;
}
const makeInput = (
  id: number,
  problem: number,
  time: string,
  options: {
    readonly mode: SyncMode;
    readonly cursorBefore: bigint;
    readonly solvedCount: number;
    readonly expectedSolvedDelta: number;
  } = {
    mode: "initial_backfill",
    cursorBefore: 0n,
    solvedCount: 1,
    expectedSolvedDelta: 1,
  },
): PersistAccountInput => {
  const member = rankMemberSchema.parse({
    accountId: "6",
    jungolName: "edge6",
    solvedCount: options.solvedCount,
    wrongCount: 0,
    acRating: 20,
    tier: 0,
  });
  return {
    plan: new AccountSyncPlan(
      options.mode,
      member,
      options.cursorBefore,
      options.expectedSolvedDelta,
      100,
    ),
    highestInspectedSubmissionId: BigInt(id),
    scannedAttemptCount: 1,
    pageCount: 1,
    now: new Date("2026-09-07Z"),
    acceptedAttempts: [
      {
        submissionId: submissionIdSchema.parse(id),
        problemId: problemIdSchema.parse(problem),
        problemName: null,
        problemTier: 0,
        score: 100,
        submittedAt: new Date(time),
      },
    ],
  };
};

export async function runEdgeCases(t: TestContext, pool: Pool): Promise<void> {
  const calendar = new KstCalendar();
  const unitOfWork = new AccountUnitOfWork(pool, calendar);
  const service = new AccountSyncService(unitOfWork, calendar);
  const metadataRefresh = new MetadataRefreshService(unitOfWork);
  const projection = new ProjectionService(
    pool,
    calendar,
    new WeightedRankingPolicy(),
    "fixed",
  );
  await t.test(
    "later repeat uses numeric repetition and event start excludes older solves",
    async () => {
      await pool.query(
        "INSERT INTO event (id,begin,end,title,created_at) VALUES (3,'2026-09-06','2026-09-08','late','2026-09-07')",
      );
      await pool.query(
        "INSERT INTO event_problem (event_id,problem,added_at) VALUES (3,6,'2026-09-07')",
      );
      await service.persist(makeInput(600, 6, "2026-09-06T14:00:00Z"));
      await service.persist(
        makeInput(601, 6, "2026-09-07T01:00:00Z", {
          mode: "incremental",
          cursorBefore: 600n,
          solvedCount: 1,
          expectedSolvedDelta: 0,
        }),
      );
      const [rows] = await pool.query<RepetitionRow[]>(
        "SELECT repeatation FROM problem WHERE external_submission_id=601",
      );
      assert.equal(rows[0]?.repeatation, 1);
      const [scores] = await pool.query<CountRow[]>(
        "SELECT COUNT(*) AS total FROM score_history WHERE event_id=3",
      );
      assert.equal(scores[0]?.total, "1");
    },
  );
  await t.test(
    "existing daily award prevents a second award on the same KST day",
    async () => {
      await pool.query(
        "INSERT INTO score_history (user_id,bias,rule_type,award_key,score_day,created_at) SELECT id,1,'daily','fixture-existing-daily','2026-09-07','2026-09-07' FROM user WHERE jungol_account_id=6",
      );
      await service.persist(
        makeInput(602, 7, "2026-09-07T02:00:00Z", {
          mode: "incremental",
          cursorBefore: 601n,
          solvedCount: 2,
          expectedSolvedDelta: 1,
        }),
      );
      const [rows] = await pool.query<CountRow[]>(
        "SELECT COUNT(*) AS total FROM score_history WHERE rule_type='daily' AND score_day='2026-09-07' AND user_id=(SELECT id FROM user WHERE jungol_account_id=6)",
      );
      assert.equal(rows[0]?.total, "1");
    },
  );
  await t.test(
    "cursor cannot regress and a rank snapshot cannot claim missing distinct solves",
    async () => {
      await assert.rejects(
        service.persist(makeInput(600, 6, "2026-09-06T14:00:00Z")),
        { code: "stale_snapshot" },
      );
      await assert.rejects(
        service.persist(
          makeInput(603, 8, "2026-09-07T03:00:00Z", {
            mode: "incremental",
            cursorBefore: 602n,
            solvedCount: 4,
            expectedSolvedDelta: 2,
          }),
        ),
        { code: "rank_mismatch" },
      );
    },
  );
  await t.test(
    "stored snapshot matches committed account state without sync_run",
    async () => {
      const connection = await pool.getConnection();
      try {
        const users = await new UserRepository(connection).readAll();
        assert.equal(
          users.find((user) => user.accountId === "6")?.cursor,
          "602",
        );
      } finally {
        connection.release();
      }
    },
  );
  await t.test(
    "metadata refresh changes only the four rank metadata columns",
    async () => {
      await pool.execute(
        "UPDATE user SET korean_name='관리자 이름', ignored=1 WHERE jungol_account_id=6",
      );
      await metadataRefresh.refresh(
        rankMemberSchema.parse({
          accountId: "6",
          jungolName: "edge6-renamed",
          solvedCount: 2,
          wrongCount: 9,
          acRating: 3000,
          tier: 31,
        }),
      );
      const [rows] = await pool.execute<MetadataRow[]>(
        "SELECT jungol_name,rank_wrong_count,ac_rating,tier,corrects,submissions,solution,korean_name,ignored FROM user WHERE jungol_account_id=6",
      );
      assert.deepEqual(rows[0], {
        jungol_name: "edge6-renamed",
        rank_wrong_count: 9,
        ac_rating: 3000,
        tier: 31,
        corrects: 2,
        submissions: 3,
        solution: "602",
        korean_name: "관리자 이름",
        ignored: 1,
      });
    },
  );
  await t.test(
    "unchanged weighted ranking skips a duplicate snapshot",
    async () => {
      const first = await projection.rebuild(new Date("2026-09-07Z"));
      const second = await projection.rebuild(new Date("2026-09-07Z"));
      assert.equal(first.kind, "changed");
      assert.equal(second.kind, "unchanged");
      assert.equal(second.boardId, first.boardId);
      assert.ok(first.boardId);
      const [rows] = await pool.query<CountRow[]>(
        "SELECT COUNT(*) AS total FROM ranking_boards WHERE id>?",
        [first.boardId],
      );
      assert.equal(rows[0]?.total, "0");
    },
  );
  await t.test(
    "duplicate replay repairs a drifted submissions counter from stored AC rows",
    async () => {
      await pool.execute(
        "UPDATE user SET submissions=99 WHERE jungol_account_id=6",
      );
      const result = await service.persist(
        makeInput(602, 7, "2026-09-07T02:00:00Z", {
          mode: "incremental",
          cursorBefore: 602n,
          solvedCount: 2,
          expectedSolvedDelta: 0,
        }),
      );
      const [rows] = await pool.execute<SubmissionCountRow[]>(
        "SELECT submissions,(SELECT COUNT(*) FROM problem WHERE user_id=u.id) AS persisted FROM user u WHERE jungol_account_id=6",
      );
      assert.equal(result.insertedAttemptCount, 0);
      assert.equal(rows[0]?.persisted, "3");
      assert.equal(rows[0]?.submissions, 3);
    },
  );
}
