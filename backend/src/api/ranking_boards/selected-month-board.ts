import { Elysia } from "elysia";
import { getDatabase } from "../../db/database.js";
import { logger } from "../../index.js";
import { RowDataPacket } from "mysql2";

export interface LastMonthRankItem {
  name: string;
  rank: number;
  lastMonthSolved: number;
  lastMonthScore: number;
}

export const lastMonthBoard = new Elysia()
  .get('/api/ranking/selected-month-board', async () => {
    try {
      const db = getDatabase();
      await db.execute('SET time_zone = "+09:00"');

      // 실행결과 0.015ms 최적화를 위해, score_hisotry에 (user_id, createdat) 인덱스 설정
      // LEFT JOIN 시에 HASH FULL JOIN으로 인해 시간손실 가능성 있음

      const query = `
        SELECT 
          u.name,
          ru.rank,
          COALESCE(p.lastMonthSolved, 0) AS lastMonthSolved,
          COALESCE(sh.lastMonthScore, 0) AS lastMonthScore
        FROM ranked_users ru
        JOIN (SELECT id FROM ranking_boards WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1) AS k
          ON k.id = ru.board_id
        JOIN user u
          ON u.id = ru.user_id
        -- 지난달 문제 풀이 집계
        LEFT JOIN (
          SELECT p.name,
                 COUNT(*) AS lastMonthSolved
          FROM problem p
          WHERE p.repeatation = 0
            AND p.time >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
            AND p.time <= LAST_DAY(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
          GROUP BY p.name
        ) p ON p.name = u.name
        -- 지난달 score_history 집계
        LEFT JOIN (
          SELECT sh.user_id,
                 SUM(sh.bias) AS lastMonthScore
          FROM score_history sh
          WHERE sh.created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
            AND sh.created_at <= LAST_DAY(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
          GROUP BY sh.user_id
        ) sh ON sh.user_id = u.id
        ORDER BY ru.rank ASC
        LIMIT 7
      `;

      logger.debug(`SQL QUERY: ${query}`);
      const [rows] = await db.execute<RowDataPacket[]>(query);
      logger.debug('DB 조회 성공 last-month-board.ts:45');

      const lastMonthBoard: LastMonthRankItem[] = rows as LastMonthRankItem[];

      return {
        success: true,
        data: lastMonthBoard,
        message: '지난달 랭킹 보드 조회 성공'
      };

    } catch (error: any) {
      logger.error('지난달 랭킹 보드 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '지난달 랭킹 보드 조회에 실패했습니다.'
      };
    }
  });
