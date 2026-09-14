import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { AccountInitializationService } from "../src/account-initialization.js";
import { AccountSettlementService } from "../src/account-settlement.js";
import {
  AcceptedAttempt,
  AccountInitialSnapshot,
  AccountSyncPlan,
  groupMemberSchema,
  ScoreAward,
} from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";
import { ScoreHistoryRepository } from "../src/mysql/awards.js";
import { HookRepository } from "../src/mysql/hooks.js";
import { CycleLeaseManager } from "../src/mysql/lease.js";
import { AccountUnitOfWork } from "../src/mysql/unit-of-work.js";
import { KstCalendar } from "../src/scoring/daily.js";

type CountRow = RowDataPacket & { readonly count: string };
const groupId = "7700";
const calendar = new KstCalendar();

const member = (accountId: number, tier = 0) =>
  groupMemberSchema.parse({
    accountId: String(accountId),
    jungolName: `settlement-${accountId}`,
    tier,
  });

const attempt = (id: number, problem: number, submittedAt: string) =>
  new AcceptedAttempt(
    submissionIdSchema.parse(id),
    problemIdSchema.parse(problem),
    null,
    1,
    new Date(submittedAt),
    100,
  );

async function initialize(pool: Pool, accountId: number, tier = 0) {
  const unitOfWork = new AccountUnitOfWork(pool, calendar);
  const snapshot = member(accountId, tier);
  await new AccountInitializationService(unitOfWork).initialize(
    new AccountInitialSnapshot(
      new AccountSyncPlan("initial_summary", snapshot, 0n, 0, 1),
      [],
      0n,
    ),
  );
  return {
    snapshot,
    settlement: new AccountSettlementService(unitOfWork, groupId, calendar),
  };
}

async function count(
  pool: Pool,
  sql: string,
  parameters: readonly unknown[] = [],
) {
  const [rows] = await pool.query<CountRow[]>(sql, parameters);
  return Number(rows[0]?.count);
}

export async function runSettlementRegressionMysqlCases(
  t: TestContext,
  pool: Pool,
): Promise<void> {
  await t.test(
    "cross-account external submission conflict rolls back the second settlement",
    async () => {
      await pool.query(
        "DELETE FROM problem WHERE external_submission_id=770001",
      );
      await pool.query(
        "DELETE FROM user WHERE jungol_account_id IN (7701,7702)",
      );
      const first = await initialize(pool, 7701);
      const second = await initialize(pool, 7702);
      const accepted = attempt(770001, 7001, "2026-09-10T01:00:00Z");
      await first.settlement.commit({
        member: first.snapshot,
        attempts: [accepted],
        highestSubmissionId: 770001n,
        now: new Date("2026-09-10T01:00:00Z"),
      });
      await assert.rejects(
        second.settlement.commit({
          member: second.snapshot,
          attempts: [accepted],
          highestSubmissionId: 770001n,
          now: new Date("2026-09-10T01:00:00Z"),
        }),
      );
      assert.equal(
        await count(
          pool,
          "SELECT COUNT(*) AS count FROM problem WHERE external_submission_id=770001",
        ),
        1,
      );
    },
  );

  await t.test(
    "same-account concurrent settlement commits one attempt and one award",
    async () => {
      await pool.query(
        "DELETE FROM problem WHERE external_submission_id=770002",
      );
      await pool.query("DELETE FROM user WHERE jungol_account_id=7703");
      const initialized = await initialize(pool, 7703);
      const batch = {
        member: initialized.snapshot,
        attempts: [attempt(770002, 7002, "2026-09-11T01:00:00Z")],
        highestSubmissionId: 770002n,
        now: new Date("2026-09-11T01:00:00Z"),
      };
      const results = await Promise.all([
        initialized.settlement.commit(batch),
        initialized.settlement.commit(batch),
      ]);
      assert.deepEqual(
        results.map((result) => result.insertedAttemptCount).sort(),
        [0, 1],
      );
      assert.equal(
        await count(
          pool,
          "SELECT COUNT(*) AS count FROM problem WHERE external_submission_id=770002",
        ),
        1,
      );
      assert.equal(
        await count(
          pool,
          "SELECT COUNT(*) AS count FROM score_history WHERE user_id=(SELECT id FROM user WHERE jungol_account_id=7703)",
        ),
        1,
      );
    },
  );

  await t.test(
    "same award key with different durable evidence rejects and rolls back",
    async () => {
      await pool.query("DELETE FROM user WHERE jungol_account_id=7705");
      const initialized = await initialize(pool, 7705);
      await initialized.settlement.commit({
        member: initialized.snapshot,
        attempts: [
          attempt(770005, 7005, "2026-09-12T01:00:00Z"),
          attempt(770006, 7006, "2026-09-13T01:00:00Z"),
        ],
        highestSubmissionId: 770006n,
        now: new Date("2026-09-13T01:00:00Z"),
      });
      const unitOfWork = new AccountUnitOfWork(pool, calendar);
      await assert.rejects(
        unitOfWork.executeConnection(async (connection) => {
          const [rows] = await connection.query<
            (RowDataPacket & {
              readonly userId: number;
              readonly problemId: number;
            })[]
          >(
            "SELECT p.user_id AS userId,p.id AS problemId FROM problem p JOIN user u ON u.id=p.user_id WHERE u.jungol_account_id=7705 ORDER BY p.problem",
          );
          const first = rows[0];
          const second = rows[1];
          if (!first || !second)
            throw new RangeError("missing_settlement_evidence");
          const scores = new ScoreHistoryRepository(connection);
          const createdAt = new Date("2026-09-13T01:00:00Z");
          await scores.insert(
            new ScoreAward(
              "daily",
              "settlement-evidence-conflict",
              first.userId,
              first.problemId,
              7005,
              null,
              "2026-09-13",
              createdAt,
            ),
          );
          await scores.insert(
            new ScoreAward(
              "daily",
              "settlement-evidence-conflict",
              second.userId,
              second.problemId,
              7006,
              null,
              "2026-09-13",
              createdAt,
            ),
          );
        }),
        { code: "score_conflict" },
      );
      assert.equal(
        await count(
          pool,
          "SELECT COUNT(*) AS count FROM score_history WHERE award_key='settlement-evidence-conflict'",
        ),
        0,
      );
    },
  );

  await t.test(
    "hook repository returns active endpoints and permanently disables selected endpoints",
    async () => {
      await pool.query(
        "DELETE FROM hook WHERE url LIKE 'https://settlement-%'",
      );
      await pool.query(
        "INSERT INTO hook (url,ignored) VALUES ('https://settlement-active.example',0),('https://settlement-muted.example',1)",
      );
      const hooks = new HookRepository(pool);
      const active = await hooks.readActive();
      const endpoint = active.find(
        (hook) => hook.url === "https://settlement-active.example",
      );
      assert.ok(endpoint);
      await hooks.ignore([endpoint.id]);
      assert.equal(
        (await hooks.readActive()).some((hook) => hook.id === endpoint.id),
        false,
      );
    },
  );

  await t.test(
    "advisory lease excludes a second owner and releases for the next owner",
    async () => {
      const name = `settlement-regression:${Date.now()}`;
      const first = new CycleLeaseManager(pool, name);
      const second = new CycleLeaseManager(pool, name);
      const lease = await first.acquire();
      assert.ok(lease);
      try {
        assert.equal(await second.acquire(), null);
      } finally {
        await lease.release();
      }
      const next = await second.acquire();
      assert.ok(next);
      try {
        assert.ok(next);
      } finally {
        await next.release();
      }
    },
  );

  await t.test(
    "repeated AC awards one in-range event and honors historical KST day boundaries",
    async () => {
      await pool.query("DELETE FROM event_problem WHERE event_id=7704");
      await pool.query("DELETE FROM event WHERE id=7704");
      await pool.query(
        "DELETE FROM problem WHERE external_submission_id IN (770003,770004,770007)",
      );
      await pool.query("DELETE FROM user WHERE jungol_account_id=7704");
      await pool.query(
        "INSERT INTO event (id,begin,end,title,created_at) VALUES (7704,'2026-09-10','2026-09-11','settlement event','2026-09-01')",
      );
      await pool.query(
        "INSERT INTO event_problem (event_id,problem,added_at) VALUES (7704,7004,'2026-09-01')",
      );
      const initialized = await initialize(pool, 7704);
      await initialized.settlement.commit({
        member: initialized.snapshot,
        attempts: [attempt(770003, 7003, "2026-09-09T14:59:59Z")],
        highestSubmissionId: 770003n,
        now: new Date("2026-09-10T00:00:00Z"),
      });
      await initialized.settlement.commit({
        member: initialized.snapshot,
        attempts: [attempt(770004, 7004, "2026-09-10T00:00:00Z")],
        highestSubmissionId: 770004n,
        now: new Date("2026-09-10T00:00:00Z"),
      });
      await initialized.settlement.commit({
        member: initialized.snapshot,
        attempts: [attempt(770007, 7004, "2026-09-10T01:00:00Z")],
        highestSubmissionId: 770007n,
        now: new Date("2026-09-10T01:00:00Z"),
      });
      assert.equal(
        await count(
          pool,
          "SELECT COUNT(*) AS count FROM problem WHERE user_id=(SELECT id FROM user WHERE jungol_account_id=7704) AND problem=7004",
        ),
        2,
      );
      assert.equal(
        await count(
          pool,
          "SELECT COUNT(*) AS count FROM score_history WHERE event_id=7704",
        ),
        1,
      );
      assert.equal(
        await count(
          pool,
          "SELECT COUNT(*) AS count FROM score_history WHERE rule_type='daily' AND user_id=(SELECT id FROM user WHERE jungol_account_id=7704)",
        ),
        2,
      );
    },
  );
}
