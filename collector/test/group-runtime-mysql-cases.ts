import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { AccountInitializationService } from "../src/account-initialization.js";
import { AccountSettlementService } from "../src/account-settlement.js";
import { GroupRuntime } from "../src/application/group-runtime.js";
import {
  AccountInitialSnapshot,
  AccountSyncPlan,
  rankMemberSchema,
} from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";
import { ProblemTierEstimator } from "../src/group-domain.js";
import { GroupFeedRepository } from "../src/mysql/group-feed.js";
import { AccountUnitOfWork } from "../src/mysql/unit-of-work.js";
import { KstCalendar } from "../src/scoring/daily.js";

interface CheckpointRow extends RowDataPacket {
  readonly window_upper_submission_id: string | null;
  readonly phase: string;
}
interface PersistedTierRow extends RowDataPacket {
  readonly external_submission_id: string;
  readonly problem_tier: number;
  readonly estimated_tier: number;
  readonly level: number;
}
interface DailyCountRow extends RowDataPacket {
  readonly count: string;
}

const member = rankMemberSchema.parse({
  accountId: "5000",
  jungolName: "runtime-case",
  solvedCount: 0,
  wrongCount: 0,
  acRating: 0,
  tier: 0,
});

const runtimeMember = (accountId: number) =>
  rankMemberSchema.parse({
    accountId: String(accountId),
    jungolName: `runtime-${accountId}`,
    solvedCount: 0,
    wrongCount: 0,
    acRating: 0,
    tier: 0,
  });

export async function runGroupRuntimeCases(
  t: TestContext,
  pool: Pool,
): Promise<void> {
  await t.test(
    "runtime caps one frozen window at ten pages and resumes it",
    async () => {
      await pool.query("DELETE FROM collector_ac_inbox");
      await pool.query("DELETE FROM collector_checkpoint");
      await pool.query("DELETE FROM problem");
      await pool.query("DELETE FROM user WHERE jungol_account_id>=5000");
      const calendar = new KstCalendar();
      const unitOfWork = new AccountUnitOfWork(pool, calendar);
      const initialization = new AccountInitializationService(unitOfWork);
      await initialization.initialize(
        new AccountInitialSnapshot(
          new AccountSyncPlan("initial_summary", member, 0n, 0, 1),
          [],
          100n,
        ),
      );
      const pages = Array.from({ length: 11 }, (_, index) => 111 - index);
      let reads = 0;
      const runtime = () =>
        new GroupRuntime({
          groupId: "1125",
          accountUnitOfWork: unitOfWork,
          initialization,
          settlement: new AccountSettlementService(
            unitOfWork,
            "1125",
            calendar,
          ),
          calendar,
          members: async () => [member],
          feed: {
            head: async () => 100n,
            readPage: async (cursor) => {
              const id = pages[reads++];
              if (id === undefined) throw new RangeError("unexpected_page");
              assert.equal(cursor, reads === 1 ? null : `cursor-${reads - 1}`);
              return {
                submissions: [
                  {
                    accountId: member.accountId,
                    submissionId: submissionIdSchema.parse(id),
                    problemId: problemIdSchema.parse(9000),
                    submittedAt: new Date("2026-09-10T00:00:00Z"),
                    score: null,
                  },
                ],
                nextCursor: reads < 11 ? `cursor-${reads}` : null,
                more: reads < 11,
              };
            },
          },
          profiles: {
            initialize: async () => ({
              member,
              solved: [],
              highestInspectedSubmissionId: 100n,
            }),
            currentMember: async () => member,
          },
          metadata: {
            read: async (problemId) => ({ problemId, title: null, tier: 0 }),
          },
          project: async () => {},
          tierEstimator: new ProblemTierEstimator(),
          now: () => new Date("2026-09-10T00:00:00Z"),
        });
      await runtime().checkpointInitialHead(new AbortController().signal);
      const first = await runtime().advanceWindow(
        new AbortController().signal,
        10,
      );
      assert.equal(first.scannedPageCount, 10);
      assert.equal(first.status, "pending");
      const [checkpoint] = await pool.query<CheckpointRow[]>(
        "SELECT window_upper_submission_id,phase FROM collector_checkpoint WHERE group_id=1125",
      );
      assert.deepEqual(checkpoint[0], {
        window_upper_submission_id: "111",
        phase: "collecting",
      });
      const resumed = await runtime().advanceWindow(
        new AbortController().signal,
        10,
      );
      assert.equal(resumed.scannedPageCount, 1);
      assert.equal(resumed.status, "complete");
      const settlement = await runtime().settle(new AbortController().signal);
      assert.equal(settlement.failedUserCount, 0);
      assert.equal(
        await runtime().finalize(new AbortController().signal),
        "finalized",
      );
      const [finished] = await pool.query<CheckpointRow[]>(
        "SELECT committed_cursor AS window_upper_submission_id,phase FROM collector_checkpoint WHERE group_id=1125",
      );
      assert.deepEqual(finished[0], {
        window_upper_submission_id: "111",
        phase: "idle",
      });
    },
  );

  await t.test(
    "runtime settles only ten oldest accounts and retains one failed account inbox",
    async () => {
      await pool.query("DELETE FROM collector_ac_inbox");
      await pool.query("DELETE FROM collector_checkpoint");
      await pool.query("DELETE FROM problem");
      await pool.query("DELETE FROM user WHERE jungol_account_id>=5000");
      const calendar = new KstCalendar();
      const unitOfWork = new AccountUnitOfWork(pool, calendar);
      const initialization = new AccountInitializationService(unitOfWork);
      const members = Array.from({ length: 100 }, (_, index) =>
        runtimeMember(5000 + index),
      );
      for (const candidate of members)
        await initialization.initialize(
          new AccountInitialSnapshot(
            new AccountSyncPlan("initial_summary", candidate, 0n, 0, 1),
            [],
            100n,
          ),
        );
      await unitOfWork.executeConnection(async (connection) => {
        const feed = new GroupFeedRepository(connection);
        await feed.insertCheckpoint("1125", "100");
        await feed.advanceCollection({
          groupId: "1125",
          upperSubmissionId: "1099",
          lowerCursor: "100",
          paginationCursor: null,
          lastScannedSubmissionId: null,
          overlapObservedCount: 10,
          cursorReached: true,
        });
        await feed.appendInbox(
          "1125",
          members.map((candidate, index) => ({
            accountId: candidate.accountId,
            submissionId: submissionIdSchema.parse(1000 + index),
            problemId: problemIdSchema.parse(9000 + index),
            submittedAt: new Date("2026-09-10T00:00:00Z"),
            score: null,
          })),
        );
      });
      let profileCalls = 0;
      const runtime = new GroupRuntime({
        groupId: "1125",
        accountUnitOfWork: unitOfWork,
        initialization,
        settlement: new AccountSettlementService(unitOfWork, "1125", calendar),
        calendar,
        members: async () => members,
        feed: {
          head: async () => 100n,
          readPage: async () => ({
            submissions: [],
            nextCursor: null,
            more: false,
          }),
        },
        profiles: {
          initialize: async () => ({
            member,
            solved: [],
            highestInspectedSubmissionId: 100n,
          }),
          currentMember: async (accountId) => {
            profileCalls += 1;
            if (accountId === members[0]?.accountId)
              throw new RangeError("profile_failed");
            return (
              members.find((candidate) => candidate.accountId === accountId) ??
              member
            );
          },
        },
        metadata: {
          read: async (problemId) => ({ problemId, title: null, tier: 0 }),
        },
        project: async () => {},
        now: () => new Date("2026-09-10T00:00:00Z"),
      });
      const result = await runtime.settle(new AbortController().signal);
      assert.equal(profileCalls, 10);
      assert.equal(result.settledUserCount, 9);
      assert.equal(result.failedUserCount, 1);
      const [inbox] = await pool.query<
        (RowDataPacket & { readonly count: string })[]
      >("SELECT COUNT(*) AS count FROM collector_ac_inbox WHERE group_id=1125");
      assert.equal(Number(inbox[0]?.count), 91);
      const [failed] = await pool.query<
        (RowDataPacket & { readonly count: string })[]
      >(
        "SELECT COUNT(*) AS count FROM collector_ac_inbox WHERE external_submission_id=1000",
      );
      assert.equal(Number(failed[0]?.count), 1);
      const [success] = await pool.query<
        (RowDataPacket & {
          readonly corrects: number;
          readonly solution: string;
        })[]
      >("SELECT corrects,solution FROM user WHERE jungol_account_id=5001");
      assert.equal(success[0]?.corrects, 1);
      assert.equal(success[0]?.solution, "1001");
    },
  );

  await t.test(
    "settlement batch selects exactly two hundred oldest rows before account grouping",
    async () => {
      await pool.query("DELETE FROM collector_ac_inbox");
      const accounts = [runtimeMember(7000), runtimeMember(7001)] as const;
      const submissions = Array.from({ length: 201 }, (_, index) => ({
        accountId:
          index % 2 === 0 ? accounts[0].accountId : accounts[1].accountId,
        submissionId: submissionIdSchema.parse(20_000 + index),
        problemId: problemIdSchema.parse(10_000 + index),
        submittedAt: new Date(Date.UTC(2026, 8, 10, 0, 0, 0, index)),
        score: null,
      }));
      const connection = await pool.getConnection();
      try {
        const feed = new GroupFeedRepository(connection);
        await feed.appendInbox("1125", submissions);
        const selected = await feed.readSettlementBatch("1125");
        assert.equal(selected.length, 200);
        assert.deepEqual(
          selected.map((submission) => submission.externalSubmissionId),
          Array.from({ length: 200 }, (_, index) => String(20_000 + index)),
        );
      } finally {
        connection.release();
      }
      const [outsideBatch] = await pool.query<
        (RowDataPacket & { readonly count: string })[]
      >(
        "SELECT COUNT(*) AS count FROM collector_ac_inbox WHERE group_id=1125 AND external_submission_id>=20200",
      );
      assert.equal(Number(outsideBatch[0]?.count), 1);
    },
  );

  await t.test(
    "runtime scores valid real tiers and only estimates missing tiers",
    async () => {
      await pool.query("DELETE FROM collector_ac_inbox");
      await pool.query("DELETE FROM problem");
      await pool.query("DELETE FROM score_history");
      await pool.query(
        "DELETE FROM user WHERE jungol_account_id IN (8100,8101)",
      );
      const calendar = new KstCalendar();
      const unitOfWork = new AccountUnitOfWork(pool, calendar);
      const initialization = new AccountInitializationService(unitOfWork);
      const members = [8100, 8101].map((accountId) =>
        rankMemberSchema.parse({
          accountId: String(accountId),
          jungolName: `tier-${accountId}`,
          solvedCount: 0,
          wrongCount: 0,
          acRating: 3000,
          tier: 31,
        }),
      );
      for (const candidate of members)
        await initialization.initialize(
          new AccountInitialSnapshot(
            new AccountSyncPlan("initial_summary", candidate, 0n, 0, 1),
            [],
            100n,
          ),
        );
      await unitOfWork.executeConnection((connection) =>
        new GroupFeedRepository(connection).appendInbox("1125", [
          {
            accountId: members[0]?.accountId ?? member.accountId,
            submissionId: submissionIdSchema.parse(101),
            problemId: problemIdSchema.parse(9810),
            submittedAt: new Date("2026-09-10T01:00:00Z"),
            score: 100,
          },
          {
            accountId: members[1]?.accountId ?? member.accountId,
            submissionId: submissionIdSchema.parse(102),
            problemId: problemIdSchema.parse(9811),
            submittedAt: new Date("2026-09-10T01:00:00Z"),
            score: 100,
          },
        ]),
      );
      let estimatorCalls = 0;
      const runtime = new GroupRuntime({
        groupId: "1125",
        accountUnitOfWork: unitOfWork,
        initialization,
        settlement: new AccountSettlementService(unitOfWork, "1125", calendar),
        calendar,
        members: async () => members,
        feed: {
          head: async () => 100n,
          readPage: async () => ({
            submissions: [],
            nextCursor: null,
            more: false,
          }),
        },
        profiles: {
          initialize: async () => assert.fail("unexpected initialization"),
          currentMember: async (accountId) =>
            members.find((candidate) => candidate.accountId === accountId) ??
            assert.fail("unknown tier fixture account"),
        },
        metadata: {
          read: async (problemId) => ({
            problemId,
            title: null,
            tier: problemId === 9810 ? 17 : 0,
          }),
        },
        project: async () => {},
        tierEstimator: {
          estimate_tier: async () => {
            estimatorCalls += 1;
            return 5;
          },
        },
        now: () => new Date("2026-09-10T01:00:00Z"),
      });
      const result = await runtime.settle(new AbortController().signal);
      assert.equal(result.failedUserCount, 0);
      assert.equal(estimatorCalls, 1);
      const [tiers] = await pool.query<PersistedTierRow[]>(
        "SELECT external_submission_id,problem_tier,estimated_tier,level FROM problem WHERE external_submission_id IN (101,102) ORDER BY external_submission_id",
      );
      assert.deepEqual(tiers, [
        {
          external_submission_id: "101",
          problem_tier: 17,
          estimated_tier: 0,
          level: -14,
        },
        {
          external_submission_id: "102",
          problem_tier: 0,
          estimated_tier: 5,
          level: -26,
        },
      ]);
      const [daily] = await pool.query<DailyCountRow[]>(
        "SELECT COUNT(*) AS count FROM score_history WHERE rule_type='daily' AND user_id=(SELECT id FROM user WHERE jungol_account_id=8100)",
      );
      assert.equal(Number(daily[0]?.count), 1);
    },
  );
}
