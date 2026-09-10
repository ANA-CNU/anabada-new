import assert from "node:assert/strict";
import test from "node:test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { AccountInitializationService } from "../src/account-initialization.js";
import {
  AccountSyncService,
  type PersistAccountInput,
} from "../src/account-sync.js";
import {
  AccountInitialSnapshot,
  AccountSyncPlan,
  InitialSolvedProblem,
  rankMemberSchema,
} from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";
import { HookRepository } from "../src/mysql/hooks.js";
import { CycleLeaseManager } from "../src/mysql/lease.js";
import { AccountUnitOfWork } from "../src/mysql/unit-of-work.js";
import { ProjectionService } from "../src/projection.js";
import { KstCalendar } from "../src/scoring/daily.js";
import { WeightedRankingPolicy } from "../src/scoring/ranking.js";
import { runEdgeCases } from "./mysql-edge-cases.js";
import { runManualProjectionCases } from "./mysql-projection-cases.js";

interface StateRow extends RowDataPacket {
  readonly attempts: string;
  readonly scores: string;
  readonly corrects: number;
  readonly submissions: number;
  readonly solution: string;
  readonly points: number;
}
interface RepetitionRow extends RowDataPacket {
  readonly repeatation: number;
}
interface CountRow extends RowDataPacket {
  readonly total: string;
}
interface BoardRow extends RowDataPacket {
  readonly id: number;
}
interface UserIdRow extends RowDataPacket {
  readonly id: number;
}
interface ScoreDayRow extends RowDataPacket {
  readonly score_day: string;
  readonly created_at: Date;
}
const { MYSQL_TEST_PASSWORD: password, MYSQL_TEST_PORT: port } = process.env;
const attempt = (
  id: number,
  problem: number,
  time = "2026-09-07T01:00:00Z",
) => ({
  submissionId: submissionIdSchema.parse(id),
  problemId: problemIdSchema.parse(problem),
  problemName: null,
  problemTier: 0,
  estimatedTier: 0,
  score: 100,
  submittedAt: new Date(time),
});
function input(
  account: number,
  attempts = [attempt(account * 100, account)],
): PersistAccountInput {
  const member = rankMemberSchema.parse({
    accountId: String(account),
    jungolName: `user${account}`,
    solvedCount: 1,
    wrongCount: 2,
    acRating: 20,
    tier: 0,
  });
  return {
    plan: new AccountSyncPlan("incremental", member, 0n, 1, 1000),
    acceptedAttempts: attempts,
    highestInspectedSubmissionId: BigInt(account * 100 + 99),
    scannedAttemptCount: attempts.length,
    pageCount: 1,
    now: new Date("2026-09-07Z"),
  };
}

test(
  "real MySQL transactional persistence",
  { skip: port === undefined },
  async (t) => {
    const pool = createPool({
      host: "127.0.0.1",
      port: Number(port),
      user: "root",
      ...(password === undefined ? {} : { password }),
      database: "jungol_bada",
      connectionLimit: 5,
      timezone: "Z",
      supportBigNumbers: true,
      bigNumberStrings: true,
      flags: ["-FOUND_ROWS"],
    });
    const calendar = new KstCalendar();
    const service = new AccountSyncService(
      new AccountUnitOfWork(pool, calendar),
      calendar,
    );
    const initialization = new AccountInitializationService(
      new AccountUnitOfWork(pool, calendar),
    );
    const initial = (
      account: number,
      problems: readonly number[],
      highestInspectedSubmissionId = 0n,
    ) => {
      const member = rankMemberSchema.parse({
        accountId: String(account),
        jungolName: `user${account}`,
        solvedCount: problems.length,
        wrongCount: 2,
        acRating: 20,
        tier: 0,
      });
      return initialization.initialize(
        new AccountInitialSnapshot(
          new AccountSyncPlan(
            "initial_summary",
            member,
            0n,
            problems.length,
            1,
          ),
          problems.map(
            (problem) =>
              new InitialSolvedProblem(problemIdSchema.parse(problem)),
          ),
          highestInspectedSubmissionId,
        ),
      );
    };
    const leases = new CycleLeaseManager(pool, "integration-cycle");
    const projection = new ProjectionService(
      pool,
      calendar,
      new WeightedRankingPolicy(),
      "anabada",
    );
    const state = async (account: number) => {
      const [rows] = await pool.execute<StateRow[]>(
        "SELECT u.corrects,u.submissions,u.solution,(SELECT COUNT(*) FROM problem p WHERE p.user_id=u.id) AS attempts,(SELECT COUNT(*) FROM score_history s WHERE s.user_id=u.id) AS scores, b.total_point AS points FROM user u LEFT JOIN user_bias_total b ON b.user_id=u.id WHERE jungol_account_id=?",
        [account],
      );
      return rows[0];
    };
    try {
      await pool.query(
        "INSERT INTO event (id,begin,end,title,created_at) VALUES (1,'2026-09-01','2026-10-01','A','2026-09-01'),(2,'2026-09-01','2026-10-01','B','2026-09-01')",
      );
      await pool.query(
        "INSERT INTO event_problem (event_id,problem,added_at) VALUES (1,99,'2026-09-01'),(2,99,'2026-09-01')",
      );
      await t.test(
        "initial summary stores one epoch baseline per solved problem without scores",
        async () => {
          await initial(12, [12, 13], 1199n);
          assert.deepEqual(await state(12), {
            corrects: 2,
            submissions: 2,
            solution: "0",
            attempts: "2",
            scores: "0",
            points: null,
          });
          const [rows] = await pool.query<
            (RepetitionRow &
              RowDataPacket & {
                readonly problem_name: string | null;
                readonly problem_tier: number;
                readonly submitted_at: Date;
                readonly level: number;
                readonly external_submission_id: string | null;
                readonly score: string | null;
              })[]
          >(
            "SELECT problem_name,problem_tier,submitted_at,level,repeatation,external_submission_id,score FROM problem WHERE user_id=(SELECT id FROM user WHERE jungol_account_id=12) ORDER BY problem",
          );
          assert.deepEqual(
            rows.map((row) => ({
              ...row,
              submitted_at: row.submitted_at.toISOString(),
            })),
            [
              {
                problem_name: null,
                problem_tier: 0,
                submitted_at: "1970-01-01T00:00:01.000Z",
                level: 0,
                repeatation: 0,
                external_submission_id: null,
                score: null,
              },
              {
                problem_name: null,
                problem_tier: 0,
                submitted_at: "1970-01-01T00:00:01.000Z",
                level: 0,
                repeatation: 0,
                external_submission_id: null,
                score: null,
              },
            ],
          );
          const [beforeReplay] = await pool.query<RowDataPacket[]>(
            "SELECT corrects,submissions,solution,initial_submission_id,initialized_at,(SELECT COUNT(*) FROM problem WHERE user_id=user.id) AS attempts FROM user WHERE jungol_account_id=12",
          );
          await initial(12, [12, 13], 1199n);
          const [afterReplay] = await pool.query<RowDataPacket[]>(
            "SELECT corrects,submissions,solution,initial_submission_id,initialized_at,(SELECT COUNT(*) FROM problem WHERE user_id=user.id) AS attempts FROM user WHERE jungol_account_id=12",
          );
          assert.equal(beforeReplay[0]?.["initial_submission_id"], "1199");
          assert.ok(beforeReplay[0]?.["initialized_at"]);
          assert.deepEqual(afterReplay[0], beforeReplay[0]);
        },
      );
      await t.test(
        "initial summary rolls back inserted user and problems, then retries",
        async () => {
          await pool.query(
            "CREATE TRIGGER reject_initial_completion BEFORE UPDATE ON user FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test rejection'",
          );
          try {
            await assert.rejects(initial(14, [14], 1399n));
            assert.equal(await state(14), undefined);
          } finally {
            await pool.query("DROP TRIGGER reject_initial_completion");
          }
          await initial(14, [14], 1399n);
          assert.equal((await state(14))?.attempts, "1");
        },
      );
      await t.test(
        "initial summary stores the solved baseline independently from profile delta",
        async () => {
          const member = rankMemberSchema.parse({
            accountId: "16",
            jungolName: "user16",
            solvedCount: 1,
            wrongCount: 0,
            acRating: 20,
            tier: 0,
          });
          await initialization.initialize(
            new AccountInitialSnapshot(
              new AccountSyncPlan("initial_summary", member, 0n, 0, 1),
              [new InitialSolvedProblem(problemIdSchema.parse(16))],
              0n,
            ),
          );
          assert.deepEqual(await state(16), {
            corrects: 1,
            submissions: 1,
            solution: "0",
            attempts: "1",
            scores: "0",
            points: null,
          });
        },
      );
      await t.test(
        "initial summary stores a solved list independently from the profile count",
        async () => {
          const member = rankMemberSchema.parse({
            accountId: "18",
            jungolName: "user18",
            solvedCount: 2,
            wrongCount: 0,
            acRating: 20,
            tier: 0,
          });
          await initialization.initialize(
            new AccountInitialSnapshot(
              new AccountSyncPlan("initial_summary", member, 0n, 2, 1),
              [16, 17, 18].map(
                (problemId) =>
                  new InitialSolvedProblem(problemIdSchema.parse(problemId)),
              ),
              1899n,
            ),
          );
          assert.deepEqual(await state(18), {
            corrects: 3,
            submissions: 3,
            solution: "0",
            attempts: "3",
            scores: "0",
            points: null,
          });
        },
      );
      await t.test(
        "zero-solved initial summary completes without a problem row",
        async () => {
          await initial(17, []);
          assert.deepEqual(await state(17), {
            corrects: 0,
            submissions: 0,
            solution: "0",
            attempts: "0",
            scores: "0",
            points: null,
          });
        },
      );
      await t.test(
        "real AC after baseline is a repeat and new incremental solve earns normally",
        async () => {
          const repeat = await service.persist({
            ...input(12, [attempt(1200, 12)]),
            highestInspectedSubmissionId: 1200n,
            plan: new AccountSyncPlan(
              "incremental",
              rankMemberSchema.parse({
                accountId: "12",
                jungolName: "user12",
                solvedCount: 2,
                wrongCount: 2,
                acRating: 20,
                tier: 0,
              }),
              0n,
              0,
              1000,
            ),
          });
          assert.deepEqual(repeat, {
            insertedAttemptCount: 1,
            duplicateAttemptCount: 0,
            newSolvedCount: 0,
          });
          await pool.query(
            "INSERT INTO event (id,begin,end,title,created_at) VALUES (6,'2026-09-01','2026-10-01','baseline follow-up','2026-09-01')",
          );
          await pool.query(
            "INSERT INTO event_problem (event_id,problem,added_at) VALUES (6,15,'2026-09-01')",
          );
          const newSolve = await service.persist({
            ...input(12, [attempt(1201, 15, "2026-09-08T01:00:00Z")]),
            highestInspectedSubmissionId: 1201n,
            plan: new AccountSyncPlan(
              "incremental",
              rankMemberSchema.parse({
                accountId: "12",
                jungolName: "user12",
                solvedCount: 3,
                wrongCount: 2,
                acRating: 20,
                tier: 0,
              }),
              1200n,
              1,
              1000,
            ),
          });
          assert.equal(newSolve.newSolvedCount, 1);
          const [rows] = await pool.query<RepetitionRow[]>(
            "SELECT repeatation FROM problem WHERE external_submission_id=1200",
          );
          assert.equal(rows[0]?.repeatation, 1);
          assert.deepEqual(await state(12), {
            corrects: 3,
            submissions: 4,
            solution: "1201",
            attempts: "4",
            scores: "2",
            points: 2,
          });
        },
      );
      await t.test(
        "webhook repository reads active endpoints and disables rejected ones",
        async () => {
          await pool.query(
            "INSERT INTO hook (url,ignored) VALUES ('https://example.test/active',0),('https://example.test/inactive',1)",
          );
          const hooks = new HookRepository(pool);
          const active = await hooks.readActive();
          assert.equal(active.length, 1);
          const endpoint = active[0];
          assert.ok(endpoint);
          assert.equal(endpoint.url, "https://example.test/active");
          await hooks.ignore([endpoint.id]);
          assert.deepEqual(await hooks.readActive(), []);
        },
      );
      await t.test(
        "incremental account stores repeated AC oldest first",
        async () => {
          const value = input(1, [
            attempt(101, 1, "2026-09-07T02:00:00Z"),
            attempt(100, 1),
          ]);
          assert.equal((await service.persist(value)).insertedAttemptCount, 2);
          assert.deepEqual(await state(1), {
            corrects: 1,
            submissions: 2,
            solution: "199",
            attempts: "2",
            scores: "1",
            points: 1,
          });
          const [rows] = await pool.query<RepetitionRow[]>(
            "SELECT repeatation FROM problem WHERE user_id=(SELECT id FROM user WHERE jungol_account_id=1) ORDER BY id",
          );
          assert.deepEqual(
            rows.map((row) => row.repeatation),
            [0, 1],
          );
        },
      );
      await t.test(
        "incremental history awards each historical KST day using submission time",
        async () => {
          const base = input(10, [
            attempt(1000, 100, "2026-09-06T14:00:00Z"),
            attempt(1001, 101, "2026-09-06T15:00:00Z"),
            attempt(1002, 102, "2026-09-07T01:00:00Z"),
          ]);
          await service.persist({
            ...base,
            plan: new AccountSyncPlan(
              "incremental",
              rankMemberSchema.parse({ ...base.plan.member, solvedCount: 3 }),
              0n,
              3,
              1000,
            ),
          });
          const [rows] = await pool.query<ScoreDayRow[]>(
            "SELECT DATE_FORMAT(score_day,'%Y-%m-%d') AS score_day,created_at FROM score_history WHERE user_id=(SELECT id FROM user WHERE jungol_account_id=10) ORDER BY score_day",
          );
          assert.deepEqual(
            rows.map((row) => [row.score_day, row.created_at.toISOString()]),
            [
              ["2026-09-06", "2026-09-06T14:00:00.000Z"],
              ["2026-09-07", "2026-09-06T15:00:00.000Z"],
            ],
          );
        },
      );
      await t.test(
        "raw AC rating and mapped tier cannot be swapped",
        async () => {
          const base = input(11);
          await assert.rejects(
            service.persist({
              ...base,
              plan: new AccountSyncPlan(
                "incremental",
                rankMemberSchema.parse({ ...base.plan.member, tier: 1 }),
                0n,
                1,
                1000,
              ),
            }),
            { code: "rating_tier_mismatch" },
          );
          assert.equal(await state(11), undefined);
        },
      );
      await t.test(
        "incremental persistence rejects an initial-summary plan",
        async () => {
          const value = input(19);
          await assert.rejects(
            service.persist({
              ...value,
              plan: new AccountSyncPlan(
                "initial_summary",
                value.plan.member,
                0n,
                1,
                1,
              ),
            }),
            { code: "account_conflict" },
          );
          assert.equal(await state(19), undefined);
        },
      );
      await t.test(
        "duplicate replay is idempotent with a stale caller snapshot",
        async () => {
          const result = await service.persist(
            input(1, [
              attempt(100, 1),
              attempt(101, 1, "2026-09-07T02:00:00Z"),
            ]),
          );
          assert.deepEqual(result, {
            insertedAttemptCount: 0,
            duplicateAttemptCount: 2,
            newSolvedCount: 0,
          });
          assert.equal((await state(1))?.scores, "1");
        },
      );
      await t.test(
        "page solved count remains independent of all-time accepted history",
        async () => {
          const base = input(
            2,
            Array.from({ length: 13 }, (_, index) =>
              attempt(200 + index, 20 + (index % 3)),
            ),
          );
          const value = {
            ...base,
            plan: new AccountSyncPlan(
              "incremental",
              rankMemberSchema.parse({
                ...base.plan.member,
                solvedCount: 3,
              }),
              0n,
              3,
              1000,
            ),
          };
          const result = await service.persist(value);
          assert.deepEqual(result, {
            insertedAttemptCount: 13,
            duplicateAttemptCount: 0,
            newSolvedCount: 3,
          });
          assert.deepEqual(await state(2), {
            corrects: 3,
            submissions: 13,
            solution: "299",
            attempts: "13",
            scores: "1",
            points: 1,
          });
        },
      );
      await t.test(
        "live-shaped history replay preserves page count and accepted rows",
        async () => {
          const base = input(
            2,
            Array.from({ length: 13 }, (_, index) =>
              attempt(200 + index, 20 + (index % 3)),
            ),
          );
          const result = await service.persist({
            ...base,
            plan: new AccountSyncPlan(
              "incremental",
              rankMemberSchema.parse({ ...base.plan.member, solvedCount: 3 }),
              0n,
              3,
              1000,
            ),
          });
          assert.deepEqual(result, {
            insertedAttemptCount: 0,
            duplicateAttemptCount: 13,
            newSolvedCount: 0,
          });
          assert.deepEqual(await state(2), {
            corrects: 3,
            submissions: 13,
            solution: "299",
            attempts: "13",
            scores: "1",
            points: 1,
          });
        },
      );
      await t.test(
        "same account serializes concurrent persistence without double award",
        async () => {
          const results = await Promise.all([
            service.persist(input(3)),
            service.persist(input(3)),
          ]);
          assert.equal(
            results.reduce(
              (sum, result) => sum + result.insertedAttemptCount,
              0,
            ),
            1,
          );
          assert.equal((await state(3))?.scores, "1");
        },
      );
      await t.test(
        "score insert failure rolls back account, attempt, counters and cursor",
        async () => {
          await pool.query(
            "CREATE TRIGGER reject_score BEFORE INSERT ON score_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test rejection'",
          );
          try {
            await assert.rejects(service.persist(input(4)));
            assert.equal(await state(4), undefined);
            const [rows] = await pool.query<CountRow[]>(
              "SELECT COUNT(*) AS total FROM problem WHERE external_submission_id=400",
            );
            assert.equal(rows[0]?.total, "0");
          } finally {
            await pool.query("DROP TRIGGER reject_score");
          }
        },
      );
      await t.test(
        "advisory cycle lock excludes a second owner and releases",
        async () => {
          const lease = await leases.acquire();
          assert.ok(lease);
          try {
            assert.equal(await leases.acquire(), null);
          } finally {
            await lease.release();
          }
          const next = await leases.acquire();
          assert.ok(next);
          await next.release();
        },
      );
      await t.test(
        "projection failure rolls back only projection and can retry",
        async () => {
          await pool.query(
            "CREATE TRIGGER reject_rank BEFORE INSERT ON ranked_users FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test rejection'",
          );
          try {
            await assert.rejects(projection.rebuild(new Date("2026-09-07Z")));
          } finally {
            await pool.query("DROP TRIGGER reject_rank");
          }
          assert.equal((await state(1))?.attempts, "2");
          const result = await projection.rebuild(new Date("2026-09-07Z"));
          assert.equal(result.kind, "changed");
          const boardId = result.boardId;
          assert.ok(boardId);
          const [rows] = await pool.query<BoardRow[]>(
            "SELECT id FROM ranking_boards WHERE is_active=1",
          );
          assert.deepEqual(
            rows.map((row) => row.id),
            [],
          );
        },
      );
      await t.test(
        "cross account submission collision rejects and rolls back",
        async () => {
          await assert.rejects(service.persist(input(5, [attempt(100, 1)])), {
            code: "submission_conflict",
          });
          assert.equal(await state(5), undefined);
        },
      );
      await t.test(
        "award key collision with different evidence rolls back",
        async () => {
          await pool.query(
            "INSERT INTO user (jungol_name,jungol_account_id) VALUES ('user7',7)",
          );
          const [users] = await pool.query<UserIdRow[]>(
            "SELECT id FROM user WHERE jungol_account_id=7",
          );
          const userId = users[0]?.id;
          assert.ok(userId);
          await pool.query(
            "INSERT INTO event (id,begin,end,title,created_at) VALUES (4,'2026-09-01','2026-10-01','conflict','2026-09-01')",
          );
          await pool.query(
            "INSERT INTO event_problem (event_id,problem,added_at) VALUES (4,7,'2026-09-01')",
          );
          await pool.execute(
            "INSERT INTO score_history (user_id,bias,rule_type,award_key,score_day,event_id,created_at) VALUES (?,1,'event',?,'2026-09-07',4,'2026-09-07')",
            [userId, `event:4:${userId}:7`],
          );
          const base = input(7);
          await assert.rejects(
            service.persist({
              ...base,
              plan: new AccountSyncPlan(
                "incremental",
                base.plan.member,
                0n,
                1,
                100,
              ),
            }),
            {
              code: "score_conflict",
            },
          );
          const [rows] = await pool.query<CountRow[]>(
            "SELECT COUNT(*) AS total FROM problem WHERE user_id=?",
            [userId],
          );
          assert.equal(rows[0]?.total, "0");
        },
      );
      await t.test(
        "repeated AC in one event stores both attempts and one event award",
        async () => {
          await pool.query(
            "INSERT INTO user (jungol_name,jungol_account_id) VALUES ('user9',9)",
          );
          await pool.query(
            "INSERT INTO event (id,begin,end,title,created_at) VALUES (5,'2026-09-01','2026-10-01','repeat','2026-09-01')",
          );
          await pool.query(
            "INSERT INTO event_problem (event_id,problem,added_at) VALUES (5,9,'2026-09-01')",
          );
          const base = input(9, [attempt(900, 9), attempt(901, 9)]);
          const result = await service.persist({
            ...base,
            plan: new AccountSyncPlan(
              "incremental",
              base.plan.member,
              0n,
              1,
              100,
            ),
          });
          assert.equal(result.insertedAttemptCount, 2);
          const [rows] = await pool.query<CountRow[]>(
            "SELECT COUNT(*) AS total FROM score_history WHERE event_id=5",
          );
          assert.equal(rows[0]?.total, "1");
        },
      );
      await t.test(
        "collector grants allow ingestion but reject DDL and DELETE",
        async () => {
          await pool.query(
            "CREATE USER 'collector_test'@'%' IDENTIFIED BY 'collector-test-only'",
          );
          const grants = [
            "GRANT SELECT ON jungol_bada.user TO 'collector_test'@'%'",
            "GRANT INSERT (jungol_name,jungol_account_id), UPDATE (id,jungol_name,corrects,submissions,solution,rank_wrong_count,ac_rating,tier) ON jungol_bada.user TO 'collector_test'@'%'",
            "GRANT SELECT, INSERT (user_id,problem,problem_name,problem_tier,estimated_tier,submitted_at,level,repeatation,verdict,external_submission_id,score), UPDATE (id) ON jungol_bada.problem TO 'collector_test'@'%'",
            "GRANT SELECT ON jungol_bada.event TO 'collector_test'@'%'",
            "GRANT SELECT ON jungol_bada.event_problem TO 'collector_test'@'%'",
            "GRANT SELECT, INSERT (user_id,problem_id,rule_type,award_key,score_day,event_id,bias,`desc`,created_at), UPDATE (id) ON jungol_bada.score_history TO 'collector_test'@'%'",
            "GRANT SELECT, INSERT (user_id,score_month,total_point), UPDATE (score_month,total_point) ON jungol_bada.user_bias_total TO 'collector_test'@'%'",
            "GRANT SELECT, INSERT (title,is_active), UPDATE (is_active) ON jungol_bada.ranking_boards TO 'collector_test'@'%'",
            "GRANT SELECT, INSERT (board_id,`rank`,user_id) ON jungol_bada.ranked_users TO 'collector_test'@'%'",
          ];
          for (const grant of grants) await pool.query(grant);
          const limited = createPool({
            host: "127.0.0.1",
            port: Number(port),
            user: "collector_test",
            password: "collector-test-only",
            database: "jungol_bada",
            timezone: "Z",
            supportBigNumbers: true,
            bigNumberStrings: true,
            flags: ["-FOUND_ROWS"],
          });
          try {
            const limitedCalendar = new KstCalendar();
            const limitedService = new AccountSyncService(
              new AccountUnitOfWork(limited, limitedCalendar),
              limitedCalendar,
            );
            assert.equal(
              (await limitedService.persist(input(8))).insertedAttemptCount,
              1,
            );
            await assert.rejects(
              limited.query("CREATE TABLE forbidden_table (id INT)"),
            );
            await assert.rejects(
              limited.query("DELETE FROM problem WHERE user_id=-1"),
            );
          } finally {
            await limited.end();
            await pool.query("DROP USER 'collector_test'@'%'");
          }
        },
      );
      await runEdgeCases(t, pool);
      await runManualProjectionCases(t, pool);
    } finally {
      await pool.end();
    }
  },
);
