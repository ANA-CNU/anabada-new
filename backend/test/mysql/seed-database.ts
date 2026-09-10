import type { Pool } from "mysql2/promise";

const tableNames = [
  "score_history",
  "event_problem",
  "ranked_users",
  "user_bias_total",
  "problem",
  "event",
  "ranking_boards",
  "hook",
  "user",
] as const;

export class SeedDatabase {
  constructor(private readonly pool: Pool) {}

  async resetAndSeed(): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.query("SET FOREIGN_KEY_CHECKS = 0");
      for (const tableName of tableNames)
        await connection.query(`TRUNCATE TABLE \`${tableName}\``);
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
      await connection.execute(
        "INSERT INTO user (id, jungol_name, corrects, submissions, solution, korean_name, tier, ac_rating, ignored, jungol_account_id, rank_wrong_count) VALUES (1, 'alpha', 3, 4, 1001, '가나다', 12, 1500, 0, 9001, 1), (2, 'beta', 2, 2, 1002, NULL, 8, 1200, 0, 9002, 0), (3, 'ignored', 1, 1, 1003, '무시', 1, 100, 1, 9003, 0)",
      );
      await connection.execute(
        "INSERT INTO problem (id, user_id, problem, problem_name, problem_tier, submitted_at, level, repeatation, verdict, external_submission_id, score) VALUES (101, 1, 1000, '현재월', 12, '2026-09-01 00:00:00.000', 12, 0, 'accepted', 5001, 12.500000), (102, 1, 1000, '반복 AC', 12, '2026-09-02 00:00:00.000', 12, 1, 'accepted', NULL, NULL), (103, 2, 2000, '지난달', 8, '2026-08-15 00:00:00.000', 8, 0, 'accepted', 5003, 8.250000), (104, 2, 1970, '요약 기준선', 0, '1970-01-01 00:00:00.000', 0, 0, 'accepted', NULL, NULL)",
      );
      await connection.execute(
        "INSERT INTO event (id, `begin`, `end`, title, `desc`, created_at) VALUES (201, '2026-09-01 00:00:00', '2026-10-01 00:00:00', '진행 이벤트', '현재', '2026-09-01 00:00:00'), (202, '2026-08-01 00:00:00', '2026-08-31 00:00:00', '과거 이벤트', '지난달', '2026-08-01 00:00:00')",
      );
      await connection.execute(
        "INSERT INTO event_problem (id, event_id, problem, added_at) VALUES (301, 201, 1000, '2026-09-01 00:00:00'), (302, 202, 2000, '2026-08-01 00:00:00')",
      );
      await connection.execute(
        "INSERT INTO score_history (id, user_id, `desc`, bias, rule_type, award_key, score_day, event_id, problem_id, created_at) VALUES (401, 1, '일일', 1, 'daily', 'daily:101', '2026-09-01', NULL, 101, '2026-09-01 00:00:00'), (402, 1, '이벤트', 1, 'event', 'event:201:101', '2026-09-01', 201, 101, '2026-09-01 00:00:01'), (403, 1, '수동 차감', -3, 'manual', NULL, NULL, NULL, NULL, '2026-09-02 00:00:00'), (404, 2, '지난달 일일', 1, 'daily', 'daily:103', '2026-08-15', NULL, 103, '2026-08-15 00:00:00')",
      );
      await connection.execute(
        "INSERT INTO ranking_boards (id, title, created_at, is_active) VALUES (501, '이전 보드', '2026-08-31 00:00:00', 0), (502, '현재 보드', '2026-09-08 00:00:00', 1)",
      );
      await connection.execute(
        "INSERT INTO ranked_users (id, board_id, `rank`, user_id) VALUES (601, 501, 1, 2), (602, 501, 2, 1), (603, 502, 1, 1), (604, 502, 2, 2)",
      );
      await connection.execute(
        "INSERT INTO user_bias_total (user_id, score_month, total_point, updated_at) VALUES (1, '2026-09-01', -1, '2026-09-08 00:00:00'), (2, '2026-09-01', 1, '2026-09-08 00:00:00')",
      );
      await connection.execute(
        "INSERT INTO hook (id, url, ignored, created_at) VALUES (701, 'https://enabled.invalid/hook', 0, '2026-09-01 00:00:00'), (702, 'https://ignored.invalid/hook', 1, '2026-09-01 00:00:00')",
      );
    } finally {
      connection.release();
    }
  }
}
