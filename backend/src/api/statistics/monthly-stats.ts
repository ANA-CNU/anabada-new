import { Elysia } from "elysia";
import { getDatabase } from "../../db/database.js";
import { logger } from "../../index.js";

export const monthlyStats = new Elysia()
  .get('/api/statistics/monthly-problems', async () => {
    try {
      const db = getDatabase();

      const sql = `
        SELECT
          DATE_FORMAT(time, '%Y-%m') AS date,
          COUNT(*) AS solved_problem
        FROM problem
        WHERE repeatation = 0
          AND time >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 YEAR), '%Y-01-01')
        GROUP BY DATE_FORMAT(time, '%Y-%m')
        ORDER BY date ASC
      `;

      logger.debug(`SQL QUERY: ${sql}`);
      
      const [rows] = await db.execute(sql);
      logger.debug('결과 확인 : ', rows as any);
      const data = rows as any[];
      logger.debug('월별 문제 해결 통계 조회 성공');

      return {
        success: true,
        data: data,
        message: '월별 문제 해결 통계 조회 성공',
        summary: {
          total_months: data.length,
          total_problems: data.reduce((sum: number, row: any) => sum + row.solved_problem, 0),
          period: '최근 1년'
        }
      };

    } catch (error: any) {
      logger.error('월별 문제 해결 통계 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '월별 문제 해결 통계 조회에 실패했습니다.'
      };
    }
  })

  .get('/api/statistics/total-problems', async () => {
    try {
      const db = getDatabase();

      const sql = `
        SELECT COUNT(*) AS total_problems
        FROM problem
        WHERE repeatation = 0
      `;

      logger.debug(`SQL QUERY: ${sql}`);

      const [rows] = await db.execute(sql);
      const data = rows as any[];
      logger.debug('전체 문제 수 조회 성공');

      return {
        success: true,
        data: {
          total_problems: data[0]?.total_problems || 0
        },
        message: '전체 문제 수 조회 성공'
      };

    } catch (error: any) {
      logger.error('전체 문제 수 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '전체 문제 수 조회에 실패했습니다.'
      };
    }
  });
  