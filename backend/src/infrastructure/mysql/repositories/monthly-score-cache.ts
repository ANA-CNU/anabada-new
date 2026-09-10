import { z } from "zod";
import type { DatabaseExecutor } from "../database-session.js";
import { sqlOperations } from "../database-session.js";

const userSchema = z.object({ id: z.coerce.number().int().positive() });
const operations = {
  lockUsers: sqlOperations.monthlyScoreLockUsers,
  refresh: sqlOperations.monthlyScoreRefresh,
} as const;

const kstMonth = (now: Date): Readonly<{
  readonly scoreMonth: string;
  readonly startUtc: Date;
  readonly endUtc: Date;
}> => {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth();
  const scoreMonth = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return {
    scoreMonth,
    startUtc: new Date(Date.UTC(year, month, 1) - 9 * 60 * 60 * 1_000),
    endUtc: new Date(Date.UTC(year, month + 1, 1) - 9 * 60 * 60 * 1_000),
  };
};

/** 수동 점수와 수집기가 같은 사용자 행을 먼저 잠가 현재 KST 월 합계를 직렬화한다. */
export class MonthlyScoreCacheRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async lockUsers(userIds: readonly number[]): Promise<void> {
    const ids = [...new Set(userIds)].sort((left, right) => left - right);
    if (ids.length === 0) return;
    await this.database.select(
      operations.lockUsers,
      "SELECT id FROM user WHERE id IN (?) ORDER BY id ASC FOR UPDATE",
      [ids],
      userSchema,
    );
  }

  async refreshUsers(userIds: readonly number[], now: Date): Promise<void> {
    const ids = [...new Set(userIds)].sort((left, right) => left - right);
    if (ids.length === 0) return;
    const month = kstMonth(now);
    await this.database.execute(
      operations.refresh,
      "INSERT INTO user_bias_total (user_id,score_month,total_point) SELECT u.id,?,COALESCE(SUM(s.bias),0) FROM user u LEFT JOIN score_history s ON s.user_id=u.id AND s.created_at>=? AND s.created_at<? WHERE u.id IN (?) GROUP BY u.id ON DUPLICATE KEY UPDATE score_month=VALUES(score_month),total_point=VALUES(total_point)",
      [month.scoreMonth, month.startUtc, month.endUtc, ids],
    );
  }
}
