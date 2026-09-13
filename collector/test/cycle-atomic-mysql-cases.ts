import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { AccountInitializationService } from "../src/account-initialization.js";
import { AccountSettlementService } from "../src/account-settlement.js";
import type { GroupFeedPage } from "../src/application/group-feed-scan-policy.js";
import {
  type GroupFeedResumePosition,
  GroupRuntime,
} from "../src/application/group-runtime.js";
import {
  AccountInitialSnapshot,
  AccountSyncPlan,
  rankMemberSchema,
} from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";
import { GroupFeedRepository } from "../src/mysql/group-feed.js";
import { AccountUnitOfWork } from "../src/mysql/unit-of-work.js";
import { ProjectionService } from "../src/projection.js";
import { KstCalendar } from "../src/scoring/daily.js";
import { WeightedRankingPolicy } from "../src/scoring/ranking.js";

type State = Readonly<Record<string, readonly RowDataPacket[]>>;

const groupId = "1125";
const accountIds = [9301, 9302] as const;
const now = () => new Date("2026-09-10T01:00:00.000Z");
const members = accountIds.map((accountId) =>
  rankMemberSchema.parse({
    accountId: String(accountId),
    jungolName: `atomic-${accountId}`,
    solvedCount: 0,
    wrongCount: 0,
    acRating: 0,
    tier: 0,
  }),
);
const elevenMembers = Array.from({ length: 11 }, (_, index) => {
  const accountId = 9301 + index;
  return rankMemberSchema.parse({
    accountId: String(accountId),
    jungolName: `atomic-${accountId}`,
    solvedCount: 0,
    wrongCount: 0,
    acRating: 0,
    tier: 0,
  });
});

function runtime(
  pool: Pool,
  options: {
    readonly failProjection?: boolean;
    readonly mutateUserDuringPreparation?: boolean;
    readonly readPage?: (
      position: GroupFeedResumePosition,
    ) => Promise<GroupFeedPage>;
    readonly memberList?: readonly (typeof members)[number][];
    readonly notifyProjection?: () => Promise<void>;
    readonly warn?: (code: string) => void;
  } = {},
) {
  const calendar = new KstCalendar();
  const unitOfWork = new AccountUnitOfWork(pool, calendar);
  const initialization = new AccountInitializationService(unitOfWork);
  return new GroupRuntime({
    groupId,
    accountUnitOfWork: unitOfWork,
    initialization,
    settlement: new AccountSettlementService(unitOfWork, groupId, calendar),
    calendar,
    members: async () => options.memberList ?? members,
    feed: {
      head: async () => 100n,
      readPage:
        options.readPage ?? (async () => ({ submissions: [], more: false })),
    },
    profiles: {
      initialize: async (member) => ({
        member,
        solved: [],
        highestInspectedSubmissionId: 100n,
      }),
      currentMember: async (accountId) =>
        (options.memberList ?? members).find(
          (member) => member.accountId === accountId,
        ) ?? assert.fail("unknown atomic fixture member"),
    },
    metadata: {
      read: async (problemId) => {
        if (options.mutateUserDuringPreparation)
          await pool.query(
            "UPDATE user SET solution=777 WHERE jungol_account_id=9301",
          );
        return { problemId, title: "atomic", tier: 1 };
      },
    },
    project: async () => {},
    ...(options.notifyProjection
      ? {
          notifyProjection: async () => options.notifyProjection?.(),
          ...(options.warn ? { warn: options.warn } : {}),
        }
      : {}),
    projectOnConnection: async (connection) => {
      if (options.failProjection)
        throw new RangeError("atomic_projection_failure");
      return new ProjectionService(
        pool,
        calendar,
        new WeightedRankingPolicy(),
        "atomic-cycle",
      ).rebuildOnConnection(connection, now());
    },
    now,
  });
}

async function state(pool: Pool): Promise<State> {
  const statements = {
    users:
      "SELECT id,jungol_account_id,jungol_name,corrects,submissions,solution,tier,ac_rating,initialized_at,initial_submission_id FROM user WHERE jungol_account_id BETWEEN 9301 AND 9311 ORDER BY jungol_account_id",
    problems:
      "SELECT p.id,p.user_id,p.problem,p.external_submission_id,p.submitted_at,p.problem_tier,p.estimated_tier,p.level,p.repeatation,p.score FROM problem p JOIN user u ON u.id=p.user_id WHERE u.jungol_account_id BETWEEN 9301 AND 9311 ORDER BY p.id",
    scores:
      "SELECT s.id,s.user_id,s.bias,s.rule_type,s.award_key,s.score_day,s.event_id,s.problem_id,s.created_at FROM score_history s JOIN user u ON u.id=s.user_id WHERE u.jungol_account_id BETWEEN 9301 AND 9311 ORDER BY s.id",
    cache:
      "SELECT b.user_id,b.score_month,b.total_point FROM user_bias_total b JOIN user u ON u.id=b.user_id WHERE u.jungol_account_id BETWEEN 9301 AND 9311 ORDER BY b.user_id,b.score_month",
    checkpoint:
      "SELECT group_id,committed_cursor,window_upper_submission_id,window_lower_cursor,pagination_cursor,last_scanned_submission_id,phase,overlap_observed_count,cursor_reached FROM collector_checkpoint WHERE group_id=1125 ORDER BY group_id",
    inbox:
      "SELECT external_submission_id,group_id,jungol_account_id,problem,submitted_at,score FROM collector_ac_inbox WHERE group_id=1125 ORDER BY external_submission_id",
    boards:
      "SELECT id,title,is_active,created_at FROM ranking_boards ORDER BY id",
    ranked: "SELECT id,board_id,`rank`,user_id FROM ranked_users ORDER BY id",
    events:
      "SELECT id,`begin`,`end`,title,created_at FROM event WHERE title='atomic cycle fixture' ORDER BY id",
    hooks: "SELECT id,url,ignored,created_at FROM hook ORDER BY id",
  } as const;
  const entries = await Promise.all(
    Object.entries(statements).map(async ([key, sql]) => {
      const [rows] = await pool.query<RowDataPacket[]>(sql);
      return [key, rows] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function cleanup(pool: Pool): Promise<void> {
  await pool.query("DROP TRIGGER IF EXISTS atomic_cycle_reject");
  await pool.query("DELETE FROM collector_ac_inbox WHERE group_id=1125");
  await pool.query("DELETE FROM collector_checkpoint WHERE group_id=1125");
  await pool.query(
    "DELETE FROM user WHERE jungol_account_id BETWEEN 9301 AND 9311",
  );
  await pool.query("DELETE FROM event WHERE title='atomic cycle fixture'");
}

async function seedSettling(pool: Pool): Promise<void> {
  const calendar = new KstCalendar();
  const initialization = new AccountInitializationService(
    new AccountUnitOfWork(pool, calendar),
  );
  for (const member of members)
    await initialization.initialize(
      new AccountInitialSnapshot(
        new AccountSyncPlan("initial_summary", member, 0n, 0, 1),
        [],
        100n,
      ),
    );
  const connection = await pool.getConnection();
  try {
    const feed = new GroupFeedRepository(connection);
    await feed.insertCheckpoint(groupId, "100");
    await feed.advanceCollection({
      groupId,
      upperSubmissionId: "930102",
      lowerCursor: "100",
      paginationCursor: null,
      lastScannedSubmissionId: null,
      overlapObservedCount: 10,
      cursorReached: true,
    });
    await feed.appendInbox(
      groupId,
      members.map((member, index) => ({
        accountId: member.accountId,
        submissionId: submissionIdSchema.parse(930101 + index),
        problemId: problemIdSchema.parse(9901 + index),
        submittedAt: now(),
        score: 100,
      })),
    );
    await connection.query(
      "INSERT INTO event (`begin`,`end`,title,created_at) VALUES ('2026-09-01','2026-10-01','atomic cycle fixture','2026-09-01')",
    );
    await connection.query(
      "INSERT INTO event_problem (event_id,problem,added_at) VALUES ((SELECT id FROM event WHERE title='atomic cycle fixture'),9901,'2026-09-01'),((SELECT id FROM event WHERE title='atomic cycle fixture'),9902,'2026-09-01')",
    );
  } finally {
    connection.release();
  }
}

export async function runCycleAtomicMysqlCases(
  t: TestContext,
  pool: Pool,
): Promise<void> {
  await t.test(
    "Given preparation I/O fails When runAtomic is called Then it creates no durable user or checkpoint writes",
    async () => {
      await cleanup(pool);
      const before = await state(pool);
      const calendar = new KstCalendar();
      const unitOfWork = new AccountUnitOfWork(pool, calendar);
      let profilesPrepared = 0;
      const badRuntime = new GroupRuntime({
        groupId,
        accountUnitOfWork: unitOfWork,
        initialization: new AccountInitializationService(unitOfWork),
        settlement: new AccountSettlementService(unitOfWork, groupId, calendar),
        calendar,
        members: async () => members,
        feed: {
          head: async () => 100n,
          readPage: async () => ({
            submissions: [],
            more: false,
          }),
        },
        profiles: {
          initialize: async (member) => {
            profilesPrepared += 1;
            if (profilesPrepared === 2)
              throw new RangeError("preparation_failed");
            return { member, solved: [], highestInspectedSubmissionId: 100n };
          },
          currentMember: async () =>
            members[0] ?? assert.fail("missing member"),
        },
        metadata: {
          read: async (problemId) => ({ problemId, title: null, tier: 1 }),
        },
        project: async () => {},
        projectOnConnection: async () => ({ kind: "unchanged", boardId: null }),
        now,
      });
      await assert.rejects(badRuntime.runAtomic(new AbortController().signal));
      assert.equal(profilesPrepared, 2);
      assert.deepEqual(await state(pool), before);
    },
  );

  await t.test(
    "Given two brand-new members When runAtomic bootstraps its initial head Then both initialization markers commit together",
    async () => {
      await cleanup(pool);
      const result = await runtime(pool).runAtomic(
        new AbortController().signal,
      );
      assert.equal(result.status, "success_pending");
      const snapshot = await state(pool);
      const { users } = snapshot;
      assert.deepEqual(
        users?.map(
          ({ jungol_account_id, initialized_at, initial_submission_id }) => ({
            accountId: jungol_account_id,
            initializedAt: initialized_at instanceof Date,
            initialSubmissionId: initial_submission_id,
          }),
        ),
        [
          {
            accountId: "9301",
            initializedAt: true,
            initialSubmissionId: "100",
          },
          {
            accountId: "9302",
            initializedAt: true,
            initialSubmissionId: "100",
          },
        ],
      );
    },
  );

  await t.test(
    "Given a persisted API inbox row When the DOM re-observes its ID with second precision and no score Then settlement retains the persisted timestamp and score",
    async () => {
      await cleanup(pool);
      await seedSettling(pool);
      await pool.query(
        "UPDATE collector_checkpoint SET phase='collecting',cursor_reached=0,last_scanned_submission_id=NULL,overlap_observed_count=0 WHERE group_id=1125",
      );
      await pool.query(
        "UPDATE collector_ac_inbox SET submitted_at='2026-09-10 01:00:00.987',score=321 WHERE external_submission_id=930102",
      );
      const result = await runtime(pool, {
        readPage: async () => ({
          submissions: [
            {
              accountId: members[1]?.accountId ?? assert.fail("missing member"),
              submissionId: submissionIdSchema.parse(930102),
              problemId: problemIdSchema.parse(9902),
              submittedAt: new Date("2026-09-10T01:00:00.000Z"),
              score: null,
            },
            {
              accountId: members[0]?.accountId ?? assert.fail("missing member"),
              submissionId: submissionIdSchema.parse(930101),
              problemId: problemIdSchema.parse(9901),
              submittedAt: new Date("2026-09-10T01:00:00.000Z"),
              score: null,
            },
          ],
          more: false,
        }),
      }).runAtomic(new AbortController().signal);
      assert.equal(result.status, "success");
      const [attempts] = await pool.query<
        (RowDataPacket & {
          readonly external_submission_id: string;
          readonly submitted_at: Date;
          readonly score: string | number;
        })[]
      >(
        "SELECT external_submission_id,submitted_at,score FROM problem WHERE external_submission_id=930102",
      );
      assert.equal(attempts.length, 1);
      assert.equal(
        attempts[0]?.submitted_at.getTime(),
        Date.parse("2026-09-10T01:00:00.987Z"),
      );
      assert.equal(Number(attempts[0]?.score), 321);
    },
  );

  for (const failure of [
    "user",
    "attempt",
    "daily",
    "event",
    "cache",
    "projection",
  ] as const)
    await t.test(
      `Given ${failure} persistence fails When a two-user cycle commits Then every cycle table is rolled back`,
      async () => {
        await cleanup(pool);
        await seedSettling(pool);
        await pool.query(
          "UPDATE user SET ignored=0 WHERE jungol_account_id IN (9301,9302)",
        );
        const before = await state(pool);
        {
          const table =
            failure === "projection"
              ? "ranked_users"
              : failure === "user"
                ? "user"
                : failure === "attempt"
                  ? "problem"
                  : failure === "cache"
                    ? "user_bias_total"
                    : "score_history";
          const operation = failure === "user" ? "UPDATE" : "INSERT";
          const condition =
            failure === "user"
              ? "IF NEW.jungol_account_id=9302 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='atomic test rejection'; END IF;"
              : failure === "attempt"
                ? "IF NEW.problem=9902 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='atomic test rejection'; END IF;"
                : failure === "daily"
                  ? "IF NEW.rule_type='daily' AND NEW.problem_id=(SELECT id FROM problem WHERE external_submission_id=930102) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='atomic test rejection'; END IF;"
                  : failure === "event"
                    ? "IF NEW.rule_type='event' AND NEW.problem_id=(SELECT id FROM problem WHERE external_submission_id=930102) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='atomic test rejection'; END IF;"
                    : failure === "cache"
                      ? "IF NEW.user_id=(SELECT id FROM user WHERE jungol_account_id=9302) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='atomic test rejection'; END IF;"
                      : "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='atomic test rejection';";
          await pool.query(
            `CREATE TRIGGER atomic_cycle_reject BEFORE ${operation} ON \`${table}\` FOR EACH ROW BEGIN ${condition} END`,
          );
        }
        try {
          await assert.rejects(
            runtime(pool).runAtomic(new AbortController().signal),
          );
        } finally {
          await pool.query("DROP TRIGGER IF EXISTS atomic_cycle_reject");
        }
        assert.deepEqual(await state(pool), before);
      },
    );

  await t.test(
    "Given checkpoint advancement fails When runAtomic scans a pending window Then the checkpoint and all inbox writes roll back",
    async () => {
      await cleanup(pool);
      await seedSettling(pool);
      await pool.query(
        "UPDATE collector_checkpoint SET phase='collecting',cursor_reached=0 WHERE group_id=1125",
      );
      const before = await state(pool);
      await pool.query(
        "CREATE TRIGGER atomic_cycle_reject BEFORE UPDATE ON collector_checkpoint FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='atomic checkpoint rejection'",
      );
      try {
        await assert.rejects(
          runtime(pool).runAtomic(new AbortController().signal),
        );
      } finally {
        await pool.query("DROP TRIGGER IF EXISTS atomic_cycle_reject");
      }
      assert.deepEqual(await state(pool), before);
    },
  );

  await t.test(
    "Given a user changes after preparation When runAtomic commits Then stale snapshot detection retains the preexisting inbox",
    async () => {
      await cleanup(pool);
      await seedSettling(pool);
      const before = await state(pool);
      await assert.rejects(
        runtime(pool, { mutateUserDuringPreparation: true }).runAtomic(
          new AbortController().signal,
        ),
      );
      const after = await state(pool);
      const { users } = after;
      for (const key of [
        "problems",
        "scores",
        "cache",
        "checkpoint",
        "inbox",
        "boards",
        "ranked",
      ] as const)
        assert.deepEqual(after[key], before[key]);
      const [changedUser] = users ?? [];
      assert.equal(
        changedUser ? Reflect.get(changedUser, "solution") : undefined,
        "777",
      );
    },
  );

  await t.test(
    "Given eleven feed pages When runAtomic reaches ten pages Then it commits pending collection before the next cycle settles the tail",
    async () => {
      await cleanup(pool);
      await seedSettling(pool);
      await pool.query("DELETE FROM collector_ac_inbox WHERE group_id=1125");
      await pool.query(
        "UPDATE collector_checkpoint SET window_upper_submission_id=930210,window_lower_cursor=100,pagination_cursor=NULL,last_scanned_submission_id=NULL,phase='collecting',overlap_observed_count=0,cursor_reached=0 WHERE group_id=1125",
      );
      const beforePending = await state(pool);
      let reads = 0;
      const readPage = async (
        position: GroupFeedResumePosition,
      ): Promise<GroupFeedPage> => {
        const index = reads;
        reads += 1;
        assert.equal(
          position.lastScannedSubmissionId,
          index === 0 ? null : String(930211 - index),
        );
        const submissionId = 930210 - index;
        return {
          submissions: [
            {
              accountId:
                members[index % 2]?.accountId ??
                members[0]?.accountId ??
                assert.fail("missing atomic member"),
              submissionId: submissionIdSchema.parse(submissionId),
              problemId: problemIdSchema.parse(9910 + index),
              submittedAt: now(),
              score: 100,
            },
          ],
          more: index < 10,
        };
      };
      const first = await runtime(pool, { readPage }).runAtomic(
        new AbortController().signal,
      );
      assert.equal(first.status, "success_pending");
      assert.equal(first.scan.scannedPageCount, 10);
      const pending = await state(pool);
      const {
        inbox: pendingInbox,
        problems: pendingProblems,
        users: pendingUsers,
      } = pending;
      const { users: beforePendingUsers } = beforePending;
      assert.equal(reads, 10);
      assert.equal(pendingInbox?.length, 10);
      assert.equal(pendingProblems?.length, 0);
      assert.deepEqual(
        pendingUsers?.map(({ solution }) => solution),
        beforePendingUsers?.map(({ solution }) => solution),
      );
      const resumed = await runtime(pool, { readPage }).runAtomic(
        new AbortController().signal,
      );
      assert.equal(resumed.status, "success");
      assert.equal(reads, 11);
      const settled = await state(pool);
      const { inbox, problems, checkpoint } = settled;
      assert.equal(inbox?.length, 0);
      assert.equal(problems?.length, 11);
      const [collectionCheckpoint] = checkpoint ?? [];
      assert.equal(
        collectionCheckpoint
          ? Reflect.get(collectionCheckpoint, "committed_cursor")
          : undefined,
        "930210",
      );
      const replay = await runtime(pool, {
        readPage: async () => ({
          submissions: [],
          more: false,
        }),
      }).runAtomic(new AbortController().signal);
      assert.equal(replay.settlement.insertedAttemptCount, 0);
      const { problems: replayProblems } = await state(pool);
      assert.equal(replayProblems?.length, 11);
    },
  );

  await t.test(
    "Given 201 pending inbox rows When runAtomic settles Then it commits the oldest 200 and retains one for the next cycle",
    async () => {
      await cleanup(pool);
      await seedSettling(pool);
      await pool.query("DELETE FROM collector_ac_inbox WHERE group_id=1125");
      const connection = await pool.getConnection();
      try {
        await new GroupFeedRepository(connection).appendInbox(
          groupId,
          Array.from({ length: 201 }, (_, index) => ({
            accountId:
              members[index % 2]?.accountId ??
              members[0]?.accountId ??
              assert.fail("missing atomic member"),
            submissionId: submissionIdSchema.parse(931000 + index),
            problemId: problemIdSchema.parse(10_000 + index),
            submittedAt: new Date(Date.UTC(2026, 8, 10, 0, 0, 0, index)),
            score: 100,
          })),
        );
      } finally {
        connection.release();
      }
      const first = await runtime(pool).runAtomic(new AbortController().signal);
      assert.equal(first.settlement.insertedAttemptCount, 200);
      const { inbox: remainingInbox } = await state(pool);
      assert.equal(remainingInbox?.length, 1);
      const second = await runtime(pool).runAtomic(
        new AbortController().signal,
      );
      assert.equal(second.settlement.insertedAttemptCount, 1);
      const settled = await state(pool);
      const { inbox: settledInbox, problems } = settled;
      assert.equal(settledInbox?.length, 0);
      assert.equal(problems?.length, 201);
    },
  );

  await t.test(
    "Given eleven accounts with one pending attempt each When runAtomic settles Then it caps at ten accounts and retains the eleventh",
    async () => {
      await cleanup(pool);
      const calendar = new KstCalendar();
      const initialization = new AccountInitializationService(
        new AccountUnitOfWork(pool, calendar),
      );
      for (const member of elevenMembers)
        await initialization.initialize(
          new AccountInitialSnapshot(
            new AccountSyncPlan("initial_summary", member, 0n, 0, 1),
            [],
            100n,
          ),
        );
      const connection = await pool.getConnection();
      try {
        const feed = new GroupFeedRepository(connection);
        await feed.insertCheckpoint(groupId, "100");
        await feed.advanceCollection({
          groupId,
          upperSubmissionId: "932011",
          lowerCursor: "100",
          paginationCursor: null,
          lastScannedSubmissionId: null,
          overlapObservedCount: 10,
          cursorReached: true,
        });
        await feed.appendInbox(
          groupId,
          elevenMembers.map((member, index) => ({
            accountId: member.accountId,
            submissionId: submissionIdSchema.parse(932001 + index),
            problemId: problemIdSchema.parse(11_000 + index),
            submittedAt: new Date(Date.UTC(2026, 8, 10, 0, 0, index)),
            score: 100,
          })),
        );
      } finally {
        connection.release();
      }
      const first = await runtime(pool, {
        memberList: elevenMembers,
      }).runAtomic(new AbortController().signal);
      assert.equal(first.settlement.settledUserCount, 10);
      const { inbox: cappedInbox } = await state(pool);
      assert.equal(cappedInbox?.length, 1);
      const second = await runtime(pool, {
        memberList: elevenMembers,
      }).runAtomic(new AbortController().signal);
      assert.equal(second.settlement.settledUserCount, 1);
      const settled = await state(pool);
      const { inbox: finalInbox, problems } = settled;
      assert.equal(finalInbox?.length, 0);
      assert.equal(problems?.length, 11);
    },
  );

  await t.test(
    "Given eleven inbox accounts and an older newly scanned account When runAtomic prepares the merged snapshot Then it settles the merged oldest ten without a stale conflict",
    async () => {
      await cleanup(pool);
      const calendar = new KstCalendar();
      const initialization = new AccountInitializationService(
        new AccountUnitOfWork(pool, calendar),
      );
      for (const member of elevenMembers)
        await initialization.initialize(
          new AccountInitialSnapshot(
            new AccountSyncPlan("initial_summary", member, 0n, 0, 1),
            [],
            100n,
          ),
        );
      const connection = await pool.getConnection();
      try {
        const feed = new GroupFeedRepository(connection);
        await feed.insertCheckpoint(groupId, "100");
        await feed.advanceCollection({
          groupId,
          upperSubmissionId: "933100",
          lowerCursor: "100",
          paginationCursor: null,
          lastScannedSubmissionId: null,
          overlapObservedCount: 0,
          cursorReached: false,
        });
        await feed.appendInbox(
          groupId,
          elevenMembers.map((member, index) => ({
            accountId: member.accountId,
            submissionId: submissionIdSchema.parse(933001 + index),
            problemId: problemIdSchema.parse(12_000 + index),
            submittedAt: new Date(Date.UTC(2026, 8, 10, 0, 0, index)),
            score: 100,
          })),
        );
      } finally {
        connection.release();
      }
      const first = await runtime(pool, {
        memberList: elevenMembers,
        readPage: async () => ({
          submissions: [
            {
              accountId:
                elevenMembers[10]?.accountId ?? assert.fail("missing member"),
              submissionId: submissionIdSchema.parse(933100),
              problemId: problemIdSchema.parse(12_100),
              submittedAt: new Date("2026-09-09T00:00:00.000Z"),
              score: 100,
            },
          ],
          more: false,
        }),
      }).runAtomic(new AbortController().signal);
      assert.equal(first.status, "success_pending");
      assert.equal(first.settlement.settledUserCount, 10);
      // biome-ignore lint/complexity/useLiteralKeys: State는 fixture SQL 결과의 index signature다.
      assert.equal((await state(pool))["inbox"]?.length, 1);
      const second = await runtime(pool, {
        memberList: elevenMembers,
      }).runAtomic(new AbortController().signal);
      assert.equal(second.settlement.insertedAttemptCount, 1);
      const settled = await state(pool);
      // biome-ignore lint/complexity/useLiteralKeys: State는 fixture SQL 결과의 index signature다.
      assert.equal(settled["inbox"]?.length, 0);
      // biome-ignore lint/complexity/useLiteralKeys: State는 fixture SQL 결과의 index signature다.
      assert.equal(settled["problems"]?.length, 12);
    },
  );

  await t.test(
    "Given a complete inbox When runAtomic succeeds and is rerun Then users, scores, cache, inbox, checkpoint and projection commit together idempotently",
    async () => {
      await cleanup(pool);
      await seedSettling(pool);
      const cycle = runtime(pool);
      const first = await cycle.runAtomic(new AbortController().signal);
      assert.equal(first.status, "success");
      assert.equal(first.settlement.settlementOutcomes?.length, 2);
      assert.ok(
        first.settlement.settlementOutcomes?.every(
          (outcome) =>
            outcome.daily.kind === "awarded" && outcome.eventIds.length === 1,
        ),
      );
      const committed = await state(pool);
      const { inbox } = committed;
      assert.equal(inbox?.length, 0);
      const second = await cycle.runAtomic(new AbortController().signal);
      assert.equal(second.status, "success");
      assert.deepEqual(second.settlement.settlementOutcomes, []);
      assert.deepEqual(await state(pool), committed);
    },
  );

  await t.test(
    "Given projection notification fails after commit When runAtomic succeeds Then committed rows remain and retry creates no duplicates",
    async () => {
      await cleanup(pool);
      await seedSettling(pool);
      const warnings: string[] = [];
      const cycle = runtime(pool, {
        notifyProjection: async () => {
          throw new RangeError("notification_failed");
        },
        warn: (code) => warnings.push(code),
      });
      const first = await cycle.runAtomic(new AbortController().signal);
      assert.equal(first.status, "success");
      assert.deepEqual(warnings, ["projection_notification_failed"]);
      const committed = await state(pool);
      const { inbox, problems } = committed;
      assert.equal(inbox?.length, 0);
      assert.equal(problems?.length, 2);
      const retry = await runtime(pool).runAtomic(new AbortController().signal);
      assert.equal(retry.settlement.insertedAttemptCount, 0);
      const { problems: retryProblems } = await state(pool);
      assert.deepEqual(retryProblems, problems);
    },
  );
}
