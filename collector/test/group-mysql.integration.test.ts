import assert from "node:assert/strict";
import test from "node:test";
import {
  createConnection,
  createPool,
  type RowDataPacket,
} from "mysql2/promise";
import pino from "pino";
import { MigrationCatalog } from "../../migrations/src/catalog.js";
import {
  type MigrationConnection,
  type MigrationConnectionFactory,
  MigrationRepository,
} from "../../migrations/src/repository.js";
import { MigrationRunner } from "../../migrations/src/runner.js";
import { AccountInitializationService } from "../src/account-initialization.js";
import { AccountSettlementService } from "../src/account-settlement.js";
import {
  AcceptedAttempt,
  AccountInitialSnapshot,
  AccountSyncPlan,
  InitialSolvedProblem,
  rankMemberSchema,
} from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";
import { GroupFeedRepository } from "../src/mysql/group-feed.js";
import { AccountUnitOfWork } from "../src/mysql/unit-of-work.js";
import { UserRepository } from "../src/mysql/users.js";
import { ProjectionService } from "../src/projection.js";
import { KstCalendar } from "../src/scoring/daily.js";
import { WeightedRankingPolicy } from "../src/scoring/ranking.js";
import { runGroupRuntimeCases } from "./group-runtime-mysql-cases.js";

interface CountRow extends RowDataPacket {
  readonly count: string;
}
interface UserRow extends RowDataPacket {
  readonly id: number;
  readonly corrects: number;
  readonly submissions: number;
  readonly solution: string;
  readonly initializedAt: Date | null;
  readonly initialSubmissionId: string | null;
}
interface ScoreRow extends RowDataPacket {
  readonly rule_type: string;
  readonly total_point: number;
}
interface AwardRow extends RowDataPacket {
  readonly rule_type: string;
  readonly score_day: Date;
  readonly created_at: Date;
}
interface SettlementStateRow extends RowDataPacket {
  readonly corrects: number;
  readonly submissions: number;
  readonly solution: string;
  readonly points: string;
  readonly scores: string;
}
interface CheckpointStateRow extends RowDataPacket {
  readonly committed_cursor: string;
  readonly phase: string;
  readonly overlap_observed_count: number;
  readonly cursor_reached: number;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly MYSQL_GROUP_MYSQL_INTEGRATION?: string;
      readonly MYSQL_TEST_DATABASE?: string;
      readonly MYSQL_TEST_HOST?: string;
      readonly MYSQL_TEST_PASSWORD?: string;
      readonly MYSQL_TEST_PORT?: string;
    }
  }
}

const host = process.env.MYSQL_TEST_HOST ?? "";
const port = Number(process.env.MYSQL_TEST_PORT);
const password = process.env.MYSQL_TEST_PASSWORD ?? "";
const database = process.env.MYSQL_TEST_DATABASE ?? "";
const enabled = process.env.MYSQL_GROUP_MYSQL_INTEGRATION === "1";

class LoopbackMigrationFactory implements MigrationConnectionFactory {
  async create(): Promise<MigrationConnection> {
    const connection = await createConnection({
      host,
      port,
      user: "root",
      password,
      multipleStatements: true,
      timezone: "Z",
    });
    await connection.query(
      "SET timestamp = UNIX_TIMESTAMP('2026-09-10 06:00:00')",
    );
    return {
      query: async (sql, parameters) => {
        const [rows, metadata] = await connection.query<RowDataPacket[]>(
          sql,
          parameters,
        );
        return [rows, metadata];
      },
      execute: async (sql, parameters) => {
        await connection.execute(sql, parameters);
      },
      end: async () => {
        await connection.end();
      },
    };
  }
}

function member(accountId: number, solvedCount = 0, acRating = 0) {
  return rankMemberSchema.parse({
    accountId: String(accountId),
    jungolName: `member-${accountId}`,
    solvedCount,
    wrongCount: 0,
    acRating,
    tier: acRating === 30 ? 1 : 0,
  });
}

function baseline(accountId: number, solved: readonly number[], cursor = 100n) {
  const snapshot = member(accountId, solved.length);
  return new AccountInitialSnapshot(
    new AccountSyncPlan("initial_summary", snapshot, 0n, solved.length, 1),
    solved.map(
      (problem) => new InitialSolvedProblem(problemIdSchema.parse(problem)),
    ),
    cursor,
  );
}

async function count(
  pool: ReturnType<typeof createPool>,
  table: string,
): Promise<number> {
  const [rows] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS count FROM \`${table}\``,
  );
  return Number(rows[0]?.count);
}

test(
  "Given a disposable MySQL 9.3 database When 002 is seeded and 003 is migrated Then group storage preserves approved state and commits atomically",
  {
    skip:
      !enabled ||
      !host ||
      !Number.isInteger(port) ||
      !password ||
      database !== "jungol_bada",
  },
  async (t) => {
    const catalog = await new MigrationCatalog(
      new URL("../../migrations/", import.meta.url).pathname,
    ).load();
    const factory = new LoopbackMigrationFactory();
    const logger = pino({ enabled: false });
    const run = async (migrations: readonly (typeof catalog)[number][]) =>
      new MigrationRunner(
        new MigrationRepository(
          {
            host: "anabada-mysql",
            port: 3306,
            user: "root",
            database: "jungol_bada",
            password,
          },
          factory,
        ),
        logger,
      ).run(migrations);
    await run(catalog.filter((migration) => migration.version === 2));
    const seed = await createConnection({
      host,
      port,
      user: "root",
      password,
      database: "jungol_bada",
      multipleStatements: true,
      timezone: "Z",
    });
    try {
      await seed.query(
        "CREATE DATABASE untouched_sentinel; INSERT INTO user (jungol_name,jungol_account_id,korean_name,ignored) VALUES ('legacy',1,'관리자명',1); INSERT INTO hook (url,ignored) VALUES ('https://hook.example',0); INSERT INTO event (`begin`,`end`,title,created_at) VALUES ('2026-09-01','2026-10-01','event','2026-09-01'); INSERT INTO event_problem (event_id,problem,added_at) VALUES (1,9001,'2026-09-01'); INSERT INTO problem (user_id,problem,submitted_at,verdict,external_submission_id) VALUES (1,1,'2026-09-10','accepted',11); INSERT INTO score_history (user_id,bias,rule_type,problem_id,created_at) VALUES (1,7,'manual',1,'2026-09-10'); INSERT INTO score_history (user_id,bias,rule_type,award_key,score_day,event_id,problem_id,created_at) VALUES (1,1,'daily','daily:legacy:2026-09-10','2026-09-10',NULL,1,'2026-09-10'),(1,1,'event','event:legacy:1','2026-09-10',1,1,'2026-09-10'); INSERT INTO ranking_boards (title,is_active) VALUES ('old',1); INSERT INTO ranked_users (board_id,`rank`,user_id) VALUES (1,1,1)",
      );
    } finally {
      await seed.end();
    }
    await run(catalog);
    await run(catalog);
    const pool = createPool({
      host,
      port,
      user: "root",
      password,
      database: "jungol_bada",
      timezone: "Z",
      supportBigNumbers: true,
      bigNumberStrings: true,
      connectionLimit: 4,
    });
    const calendar = new KstCalendar();
    try {
      await t.test(
        "migration ledger is idempotent and reset preserves only approved legacy rows",
        async () => {
          assert.equal(await count(pool, "migrations"), 2);
          assert.equal(await count(pool, "problem"), 0);
          assert.equal(await count(pool, "ranking_boards"), 0);
          const [scores] = await pool.query<ScoreRow[]>(
            "SELECT rule_type,total_point FROM score_history JOIN user_bias_total ON user_bias_total.user_id=score_history.user_id ORDER BY score_history.id",
          );
          assert.deepEqual(scores, [{ rule_type: "manual", total_point: 7 }]);
          const [users] = await pool.query<
            (UserRow &
              RowDataPacket & {
                readonly jungol_name: string;
                readonly jungol_account_id: string;
                readonly korean_name: string;
                readonly ignored: number;
              })[]
          >(
            "SELECT id,jungol_name,jungol_account_id,korean_name,ignored,corrects,submissions,solution,initialized_at AS initializedAt,initial_submission_id AS initialSubmissionId FROM user WHERE jungol_account_id=1",
          );
          assert.deepEqual(users[0], {
            id: 1,
            jungol_name: "legacy",
            jungol_account_id: "1",
            korean_name: "관리자명",
            ignored: 1,
            corrects: 0,
            submissions: 0,
            solution: "0",
            initializedAt: null,
            initialSubmissionId: null,
          });
          assert.equal(await count(pool, "hook"), 1);
          assert.equal(await count(pool, "event"), 1);
          assert.equal(await count(pool, "event_problem"), 1);
          const [sentinel] = await pool.query<CountRow[]>(
            "SELECT COUNT(*) AS count FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='untouched_sentinel'",
          );
          assert.equal(Number(sentinel[0]?.count), 1);
        },
      );
      const initialization = new AccountInitializationService(
        new AccountUnitOfWork(pool, calendar),
      );
      await t.test(
        "initialization uses the solved baseline once, is replay-safe, and rejects partial markers",
        async () => {
          await initialization.initialize(baseline(200, [1, 2], 2000n));
          await initialization.initialize(baseline(200, [1, 2], 2000n));
          await pool.query(
            "INSERT INTO user (jungol_name,jungol_account_id,initialized_at) VALUES ('partial',201,'2026-09-01')",
          );
          await assert.rejects(
            initialization.initialize(baseline(201, [3], 2010n)),
            { code: "account_conflict" },
          );
          const [rows] = await pool.query<UserRow[]>(
            "SELECT id,corrects,submissions,solution,initialized_at AS initializedAt,initial_submission_id AS initialSubmissionId FROM user WHERE jungol_account_id=200",
          );
          assert.equal(rows[0]?.corrects, 2);
          assert.equal(rows[0]?.submissions, 2);
          assert.equal(rows[0]?.solution, "0");
          assert.equal(rows[0]?.initialSubmissionId, "2000");
        },
      );
      await t.test(
        "completeSync counts the durable ledger rather than a rank snapshot",
        async () => {
          await initialization.initialize(baseline(300, [], 0n));
          const connection = await pool.getConnection();
          try {
            const users = new UserRepository(connection);
            const user = await users.lockExisting("300");
            await connection.query(
              "INSERT INTO problem (user_id,problem,submitted_at,verdict,external_submission_id) VALUES (?,1,'2026-09-10','accepted',3001),(?,1,'2026-09-10','accepted',3002),(?,2,'2026-09-10','accepted',3003)",
              [user.id, user.id, user.id],
            );
            await users.completeSync({
              userId: user.id,
              member: member(300, 999),
              highestInspectedSubmissionId: 3003n,
            });
          } finally {
            connection.release();
          }
          const [rows] = await pool.query<UserRow[]>(
            "SELECT id,corrects,submissions,solution,initialized_at AS initializedAt,initial_submission_id AS initialSubmissionId FROM user WHERE jungol_account_id=300",
          );
          assert.equal(rows[0]?.corrects, 2);
          assert.equal(rows[0]?.submissions, 3);
        },
      );
      await t.test(
        "inbox settlement uses prepared tier, remains idempotent, rolls back on SQL failure, and projection reads cache only",
        async () => {
          await initialization.initialize(baseline(400, [], 100n));
          const connection = await pool.getConnection();
          try {
            const feed = new GroupFeedRepository(connection);
            await feed.insertCheckpoint("77", "100");
            await feed.advanceCollection({
              groupId: "77",
              upperSubmissionId: "103",
              lowerCursor: "100",
              paginationCursor: null,
              lastScannedSubmissionId: null,
              overlapObservedCount: 1,
              cursorReached: true,
            });
            await feed.appendInbox("77", [
              {
                accountId: member(400).accountId,
                submissionId: submissionIdSchema.parse(101),
                problemId: problemIdSchema.parse(9001),
                submittedAt: new Date("2026-09-07T01:00:00Z"),
                score: 100,
              },
            ]);
          } finally {
            connection.release();
          }
          const service = new AccountSettlementService(
            new AccountUnitOfWork(pool, calendar),
            "77",
            calendar,
          );
          await pool.query(
            "UPDATE user SET tier=31 WHERE jungol_account_id=400",
          );
          const prepared = {
            member: member(400, 0, 30),
            highestSubmissionId: 101n,
            now: new Date("2026-09-10T01:00:00Z"),
            attempts: [
              new AcceptedAttempt(
                submissionIdSchema.parse(101),
                problemIdSchema.parse(9001),
                null,
                20,
                new Date("2026-09-07T01:00:00Z"),
                100,
                0,
              ),
            ],
          };
          const finalization = await pool.getConnection();
          try {
            assert.equal(
              await new GroupFeedRepository(
                finalization,
              ).finalizeWhenInboxEmpty("77"),
              false,
            );
          } finally {
            finalization.release();
          }
          await service.commit(prepared);
          await service.commit(prepared);
          assert.equal(await count(pool, "collector_ac_inbox"), 0);
          const [daily] = await pool.query<AwardRow[]>(
            "SELECT rule_type,score_day,created_at FROM score_history WHERE user_id=(SELECT id FROM user WHERE jungol_account_id=400) ORDER BY rule_type",
          );
          assert.deepEqual(
            daily.map((award) => ({
              ...award,
              score_day: award.score_day.toISOString().slice(0, 10),
              created_at: award.created_at.toISOString(),
            })),
            [
              {
                rule_type: "daily",
                score_day: "2026-09-07",
                created_at: "2026-09-07T01:00:00.000Z",
              },
              {
                rule_type: "event",
                score_day: "2026-09-07",
                created_at: "2026-09-07T01:00:00.000Z",
              },
            ],
          );
          const [level] = await pool.query<RowDataPacket[]>(
            "SELECT problem_tier,estimated_tier,level FROM problem WHERE external_submission_id=101",
          );
          assert.deepEqual(level[0], {
            problem_tier: 20,
            estimated_tier: 0,
            level: 19,
          });
          const retryConnection = await pool.getConnection();
          try {
            await new GroupFeedRepository(retryConnection).appendInbox("77", [
              {
                accountId: member(400).accountId,
                submissionId: submissionIdSchema.parse(102),
                problemId: problemIdSchema.parse(9002),
                submittedAt: new Date("2026-09-08T01:00:00Z"),
                score: 100,
              },
            ]);
          } finally {
            retryConnection.release();
          }
          const [beforeFailure] = await pool.query<SettlementStateRow[]>(
            "SELECT u.corrects,u.submissions,u.solution,COALESCE(b.total_point,0) AS points,(SELECT COUNT(*) FROM score_history s WHERE s.user_id=u.id) AS scores FROM user u LEFT JOIN user_bias_total b ON b.user_id=u.id WHERE u.jungol_account_id=400",
          );
          await pool.query(
            "CREATE TRIGGER reject_group_settlement BEFORE UPDATE ON user FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test rejection'",
          );
          const rejected = {
            ...prepared,
            highestSubmissionId: 102n,
            attempts: [
              new AcceptedAttempt(
                submissionIdSchema.parse(102),
                problemIdSchema.parse(9002),
                null,
                0,
                new Date("2026-09-08T01:00:00Z"),
                100,
                0,
              ),
            ],
          };
          try {
            await assert.rejects(service.commit(rejected));
          } finally {
            await pool.query("DROP TRIGGER reject_group_settlement");
          }
          assert.equal(await count(pool, "collector_ac_inbox"), 1);
          assert.equal(await count(pool, "problem"), 6);
          const [afterFailure] = await pool.query<SettlementStateRow[]>(
            "SELECT u.corrects,u.submissions,u.solution,COALESCE(b.total_point,0) AS points,(SELECT COUNT(*) FROM score_history s WHERE s.user_id=u.id) AS scores FROM user u LEFT JOIN user_bias_total b ON b.user_id=u.id WHERE u.jungol_account_id=400",
          );
          assert.deepEqual(afterFailure[0], beforeFailure[0]);
          await service.commit(rejected);
          assert.equal(await count(pool, "collector_ac_inbox"), 0);
          const repeatEventConnection = await pool.getConnection();
          try {
            await new GroupFeedRepository(repeatEventConnection).appendInbox(
              "77",
              [
                {
                  accountId: member(400).accountId,
                  submissionId: submissionIdSchema.parse(103),
                  problemId: problemIdSchema.parse(9001),
                  submittedAt: new Date("2026-09-08T01:00:00Z"),
                  score: 100,
                },
              ],
            );
          } finally {
            repeatEventConnection.release();
          }
          const repeatedEvent = {
            ...prepared,
            highestSubmissionId: 103n,
            attempts: [
              new AcceptedAttempt(
                submissionIdSchema.parse(103),
                problemIdSchema.parse(9001),
                null,
                20,
                new Date("2026-09-08T01:00:00Z"),
                100,
                0,
              ),
            ],
          };
          await service.commit(repeatedEvent);
          assert.equal(await count(pool, "collector_ac_inbox"), 0);
          const [afterRepeatedEvent] = await pool.query<SettlementStateRow[]>(
            "SELECT u.corrects,u.submissions,u.solution,COALESCE(b.total_point,0) AS points,(SELECT COUNT(*) FROM score_history s WHERE s.user_id=u.id) AS scores FROM user u LEFT JOIN user_bias_total b ON b.user_id=u.id WHERE u.jungol_account_id=400",
          );
          assert.deepEqual(afterRepeatedEvent[0], {
            corrects: 2,
            submissions: 3,
            solution: "103",
            points: "3",
            scores: "3",
          });
          const finalized = await pool.getConnection();
          try {
            assert.equal(
              await new GroupFeedRepository(finalized).finalizeWhenInboxEmpty(
                "77",
              ),
              true,
            );
          } finally {
            finalized.release();
          }
          const [checkpoint] = await pool.query<CheckpointStateRow[]>(
            "SELECT committed_cursor,phase,overlap_observed_count,cursor_reached FROM collector_checkpoint WHERE group_id=77",
          );
          assert.deepEqual(checkpoint[0], {
            committed_cursor: "103",
            phase: "idle",
            overlap_observed_count: 0,
            cursor_reached: 0,
          });
          await pool.query(
            "INSERT INTO score_history (user_id,bias,rule_type,created_at) VALUES ((SELECT id FROM user WHERE jungol_account_id=400),999,'manual','2026-09-07')",
          );
          const projection = await new ProjectionService(
            pool,
            calendar,
            new WeightedRankingPolicy(),
            "group-test",
          ).rebuild(new Date("2026-09-07T01:00:00Z"));
          assert.equal(projection.kind, "changed");
          if (projection.kind === "changed")
            assert.equal(
              Number(
                projection.entries.find(
                  (entry) => entry.jungolName === "member-400",
                )?.score,
              ),
              3,
            );
          const [boards] = await pool.query<CountRow[]>(
            "SELECT COUNT(*) AS count FROM ranking_boards",
          );
          assert.equal(Number(boards[0]?.count), 1);
        },
      );
      await runGroupRuntimeCases(t, pool);
    } finally {
      await pool.end();
    }
  },
);
