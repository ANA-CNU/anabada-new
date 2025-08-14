import { Elysia } from "elysia";
import { getDatabase } from "../../db/database.js";
import { logger } from "../../index.js";

export const recentlySolve = new Elysia()
  .get('/api/statistics/recently-solved', async ({ query }) => {
    try {
      const db = getDatabase();
      const page = parseInt(query.page as string) || 1;
      const limit = parseInt(query.limit as string) || 10;
      const offset = (page - 1) * limit;

      // 페이지네이션된 데이터 조회
      const sql = `
        SELECT 
          u.name AS username,
          p.problem AS problem,
          p.time AS solvedAt
        FROM problem p
        JOIN user u ON p.name = u.name
        WHERE p.repeatation = 0
        ORDER BY p.time DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      logger.debug(`SQL QUERY: ${sql} with limit: ${limit}, offset: ${offset}`);

      const [rows] = await db.execute(sql, [limit, offset]);
      const data = rows as any[];
      logger.debug(`최근 해결된 문제 페이지 ${page} 조회 성공`);

      return {
        success: true,
        data: data,
        message: `최근 해결된 문제 페이지 ${page} 조회 성공`,
        summary: {
          count: data.length,
          description: '중복 제거된 최근 해결된 문제 목록',
          order: '해결 시간 기준 내림차순'
        }
      };

    } catch (error: any) {
      logger.error('최근 해결된 문제 페이지 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '최근 해결된 문제 페이지 조회에 실패했습니다.'
      };
    }
  });
