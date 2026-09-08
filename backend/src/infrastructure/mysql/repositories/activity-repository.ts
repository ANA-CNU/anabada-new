import { z } from "zod";
import type { KstMonthBucket } from "../../time.js";
import type { DatabaseExecutor } from "../database-session.js";
import { sqlOperations } from "../database-session.js";
import {
  type MonthlySummaryDto,
  type ProblemDto,
  type RecentSolvedDto,
  monthlySummarySchema,
  problemDtoSchema,
  recentSolvedDtoSchema,
} from "./contracts.js";

const operations = {
  userProblems: sqlOperations.activityUserProblems,
  recent: sqlOperations.activityRecent,
  monthly: sqlOperations.activityMonthly,
  monthlyStats: sqlOperations.activityMonthlyStats,
  total: sqlOperations.activityTotal,
} as const;
const monthlyStatSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}$/),
  solved_problem: z.number().int().nonnegative(),
});
const totalSchema = z.object({
  total_problems: z.number().int().nonnegative(),
});

export class ActivityRepository {
  constructor(private readonly database: DatabaseExecutor) {}
  async problemsForUser(userId: number): Promise<readonly ProblemDto[]> {
    return this.database.select(
      operations.userProblems,
      "SELECT CAST(p.id AS CHAR) AS id, p.user_id, p.problem, p.problem_name, p.problem_tier, p.submitted_at, p.level, p.repeatation, p.verdict, CAST(p.external_submission_id AS CHAR) AS external_submission_id, p.score FROM problem p WHERE p.user_id = ? AND p.repeatation = 0 AND p.verdict = 'accepted' ORDER BY p.submitted_at DESC LIMIT 50",
      [userId],
      problemDtoSchema,
    );
  }
  async recentlySolved(
    limit: number,
    offset: number,
  ): Promise<readonly RecentSolvedDto[]> {
    return this.database.select(
      operations.recent,
      "SELECT COALESCE(u.korean_name, u.jungol_name) AS display_name, u.jungol_name, u.korean_name, p.problem, p.problem_name, p.submitted_at FROM problem p JOIN user u ON p.user_id = u.id WHERE p.repeatation = 0 AND p.verdict = 'accepted' AND u.ignored = 0 ORDER BY p.submitted_at DESC LIMIT ? OFFSET ?",
      [limit, offset],
      recentSolvedDtoSchema,
    );
  }
  async monthlySummary(
    userId: number,
    start: Date,
    end: Date,
    startDate: string,
    endDate: string,
  ): Promise<MonthlySummaryDto> {
    const row = await this.database.selectOne(
      operations.monthly,
      "SELECT ? AS start_date, ? AS end_date, COUNT(p.id) AS total_solved, COALESCE((SELECT SUM(s.bias) FROM score_history s WHERE s.user_id = ? AND s.created_at >= ? AND s.created_at < ?), 0) AS total_score FROM problem p WHERE p.user_id = ? AND p.repeatation = 0 AND p.verdict = 'accepted' AND p.submitted_at >= ? AND p.submitted_at < ?",
      [startDate, endDate, userId, start, end, userId, start, end],
      monthlySummarySchema,
    );
    return (
      row ?? {
        start_date: startDate,
        end_date: endDate,
        total_solved: 0,
        total_score: 0,
      }
    );
  }
  async monthlyStats(
    buckets: readonly KstMonthBucket[],
  ): Promise<readonly z.output<typeof monthlyStatSchema>[]> {
    const bucketSql = buckets
      .map((_, index) =>
        index === 0
          ? "SELECT ? AS date, ? AS start_at, ? AS end_at"
          : "UNION ALL SELECT ?, ?, ?",
      )
      .join(" ");
    const values = buckets.flatMap((bucket) => [
      bucket.key,
      bucket.start,
      bucket.end,
    ]);
    return this.database.select(
      operations.monthlyStats,
      `SELECT buckets.date, COUNT(p.id) AS solved_problem FROM (${bucketSql}) AS buckets LEFT JOIN problem p ON p.repeatation = 0 AND p.verdict = 'accepted' AND p.submitted_at >= buckets.start_at AND p.submitted_at < buckets.end_at GROUP BY buckets.date, buckets.start_at ORDER BY buckets.start_at`,
      values,
      monthlyStatSchema,
    );
  }
  async totalProblems(): Promise<number> {
    return (
      (
        await this.database.selectOne(
          operations.total,
          "SELECT COUNT(*) AS total_problems FROM problem WHERE repeatation = 0 AND verdict = 'accepted'",
          [],
          totalSchema,
        )
      )?.total_problems ?? 0
    );
  }
}
