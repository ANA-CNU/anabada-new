import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { KstCalendar } from "./scoring/daily.js";

interface UserRow extends RowDataPacket {
  readonly id: number;
}

/** 월 경계에서만 오래된 합계를 교체한다. 사용자 잠금 순서는 점수 쓰기 경로와 같다. */
export class MonthlyScoreCacheService {
  constructor(
    private readonly connection: PoolConnection,
    private readonly calendar: KstCalendar,
  ) {}

  async rebuildStale(now: Date): Promise<void> {
    const [start, end] = this.calendar.monthWindow(now);
    const scoreMonth = `${this.calendar.day(now).slice(0, 7)}-01`;
    const [users] = await this.connection.query<UserRow[]>(
      "SELECT id FROM user ORDER BY id ASC FOR UPDATE",
    );
    if (users.length === 0) return;
    await this.connection.execute(
      "INSERT INTO user_bias_total (user_id,score_month,total_point) SELECT u.id,?,COALESCE(SUM(s.bias),0) FROM user u LEFT JOIN user_bias_total b ON b.user_id=u.id LEFT JOIN score_history s ON s.user_id=u.id AND s.created_at>=? AND s.created_at<? WHERE b.user_id IS NULL OR b.score_month<>? GROUP BY u.id ON DUPLICATE KEY UPDATE score_month=VALUES(score_month),total_point=VALUES(total_point)",
      [scoreMonth, start, end, scoreMonth],
    );
  }
}
