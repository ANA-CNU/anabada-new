import type { Pool, RowDataPacket } from "mysql2/promise";
import { AccountInitializationService } from "../src/account-initialization.js";
import { AccountSettlementService } from "../src/account-settlement.js";
import { GroupRuntime } from "../src/application/group-runtime.js";
import {
  AccountInitialSnapshot,
  AccountSyncPlan,
  groupMemberSchema,
} from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";
import { JungolError } from "../src/jungol/errors.js";
import { AccountUnitOfWork } from "../src/mysql/unit-of-work.js";
import { ProjectionService } from "../src/projection.js";
import { KstCalendar } from "../src/scoring/daily.js";
import { WeightedRankingPolicy } from "../src/scoring/ranking.js";

export const groupId = "1125";
export const firstSubmission = 980_001;
export const secondSubmission = 980_002;
const submittedAt = new Date("2026-09-13T04:41:15.334Z");
const now = () => new Date("2026-09-16T01:00:00.000Z");

export interface DailyStateRow extends RowDataPacket {
  readonly external_submission_id: string;
  readonly problem_tier: number;
  readonly estimated_tier: number;
  readonly level: number;
  readonly solution: string;
  readonly daily_count: string;
  readonly score_day: string | null;
  readonly cache_total: string;
}
export interface CheckpointRow extends RowDataPacket {
  readonly committed_cursor: string;
  readonly phase: string;
}
export function member(accountId: number) {
  return groupMemberSchema.parse({
    accountId: String(accountId),
    jungolName: `daily-missed-${accountId}`,
    tier: 8,
  });
}
export async function cleanup(pool: Pool): Promise<void> {
  await pool.query("DELETE FROM collector_ac_inbox WHERE group_id=1125");
  await pool.query("DELETE FROM collector_checkpoint WHERE group_id=1125");
  await pool.query(
    "DELETE FROM user WHERE jungol_account_id BETWEEN 9801 AND 9803",
  );
}
export async function initialize(
  pool: Pool,
  candidate: ReturnType<typeof member>,
): Promise<void> {
  const calendar = new KstCalendar();
  await new AccountInitializationService(
    new AccountUnitOfWork(pool, calendar),
  ).initialize(
    new AccountInitialSnapshot(
      new AccountSyncPlan("initial_summary", candidate, 0n, 0, 1),
      [],
      980_000n,
    ),
  );
}
export function runtime(
  pool: Pool,
  candidate: ReturnType<typeof member>,
  submissionId: number,
  metadataTier: number | "throw",
  calls: { count: number; metadataCount: number },
): GroupRuntime {
  const calendar = new KstCalendar();
  const unitOfWork = new AccountUnitOfWork(pool, calendar);
  return new GroupRuntime({
    groupId,
    accountUnitOfWork: unitOfWork,
    initialization: new AccountInitializationService(unitOfWork),
    settlement: new AccountSettlementService(unitOfWork, groupId, calendar),
    calendar,
    members: async () => [candidate],
    feed: {
      head: async () => BigInt(submissionId),
      readPage: async () => ({
        submissions: [
          {
            accountId: candidate.accountId,
            submissionId: submissionIdSchema.parse(submissionId),
            problemId: problemIdSchema.parse(5498),
            submittedAt,
            score: 100,
          },
        ],
        nextCursor: null,
        more: false,
      }),
    },
    profiles: {
      initialize: async () => ({
        member: candidate,
        solved: [],
        highestInspectedSubmissionId: 980_000n,
      }),
      currentMember: async () => candidate,
    },
    metadata: {
      read: async (problemId) => {
        calls.metadataCount += 1;
        if (metadataTier === "throw")
          throw new JungolError("problem_metadata_timeout", {
            stage: "problem_metadata_readiness",
            reason: "timeout",
            problemId,
            timeoutMs: 30000,
            imageObserved: true,
            titleObserved: false,
          });
        return { problemId, title: "daily-missed", tier: metadataTier };
      },
    },
    project: async () => {},
    projectOnConnection: async (connection) =>
      new ProjectionService(
        pool,
        calendar,
        new WeightedRankingPolicy(),
        "daily-missed",
      ).rebuildOnConnection(connection, now()),
    tierEstimator: {
      estimate_tier: async () => {
        calls.count += 1;
        return 0;
      },
    },
    now,
  });
}
export async function state(
  pool: Pool,
  accountId: number,
): Promise<DailyStateRow> {
  const [rows] = await pool.query<DailyStateRow[]>(
    "SELECT p.external_submission_id,p.problem_tier,p.estimated_tier,p.level,u.solution,(SELECT COUNT(*) FROM score_history s WHERE s.user_id=u.id AND s.rule_type='daily') AS daily_count,(SELECT DATE_FORMAT(score_day,'%Y-%m-%d') FROM score_history s WHERE s.user_id=u.id AND s.rule_type='daily' LIMIT 1) AS score_day,COALESCE((SELECT total_point FROM user_bias_total b WHERE b.user_id=u.id AND b.score_month='2026-09-01'),0) AS cache_total FROM user u JOIN problem p ON p.user_id=u.id WHERE u.jungol_account_id=? ORDER BY p.id DESC LIMIT 1",
    [accountId],
  );
  const row = rows[0];
  if (!row) throw new RangeError("missing_daily_missed_state");
  return row;
}
