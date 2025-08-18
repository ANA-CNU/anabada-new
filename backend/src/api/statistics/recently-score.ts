import { Elysia } from "elysia";
import { getDatabase } from "../../db/database.js";
import { logger } from "../../index.js";

export const recentlyScore = new Elysia()
  .get('/api/statistics/recently-score', async ({ query }) => {
    try {
      const db = await getDatabase();
      const page = Math.max(parseInt(query.page as string) || 1, 1);
      const limitRaw = parseInt(query.limit as string) || 10;
      const limit = Math.min(Math.max(limitRaw, 1), 100);
      const offset = (page - 1) * limit;

      // 세션 시간대를 KST로 설정
      await db.execute("SET time_zone = '+09:00'");

      // 페이지네이션된 데이터 조회 (KST 시간대 유지)
      const sql = `
        SELECT
          u.name AS username,
          sh.desc,
          sh.bias,
          CONCAT(
            DATE_FORMAT(sh.created_at, '%Y-%m-%dT%H:%i:%s'),
            '+09:00'
          ) AS createdAt
        FROM score_history sh
        JOIN user u ON sh.user_id = u.id
        ORDER BY sh.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      logger.debug(`SQL QUERY: ${sql} with limit: ${limit}, offset: ${offset}`);

      const [rows] = await db.execute(sql);
      const data = rows as any[];
      logger.debug(`최근 점수 기록 페이지 ${page} 조회 성공`);

      return {
        success: true,
        data: data,
        message: `최근 점수 기록 페이지 ${page} 조회 성공`,
        summary: {
          count: data.length,
          description: '사용자별 최근 점수 기록',
          order: '생성 시간 기준 내림차순',
          limit: limit,
          page: page
        }
      };

    } catch (error: any) {
      logger.error('최근 점수 기록 페이지 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '최근 점수 기록 페이지 조회에 실패했습니다.'
      };
    }
  })

  .get('/api/statistics/recently-score/top', async ({ query }) => {
    try {
      const db = getDatabase();
      const limitRaw = parseInt(query.limit as string) || 100;
      const limit = Math.min(Math.max(limitRaw, 1), 500);

      const sql = `
        SELECT
          u.name AS username,
          sh.desc,
          sh.bias,
          CONCAT(
            DATE_FORMAT(sh.created_at, '%Y-%m-%dT%H:%i:%s'),
            '+09:00'
          ) AS createdAt
        FROM score_history sh
        JOIN user u ON sh.user_id = u.id
        ORDER BY sh.created_at DESC
        LIMIT ?
      `;

      logger.debug(`SQL QUERY: ${sql} with limit: ${limit}`);

      const [rows] = await db.execute(sql, [limit]);
      const data = rows as any[];
      logger.debug(`최근 점수 기록 TOP ${limit} 조회 성공`);

      return {
        success: true,
        data: data,
        message: `최근 점수 기록 TOP ${limit} 조회 성공`,
        summary: {
          count: data.length,
          description: '사용자별 최근 점수 기록 TOP',
          order: '생성 시간 기준 내림차순',
          limit: limit
        }
      };

    } catch (error: any) {
      logger.error('최근 점수 기록 TOP 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '최근 점수 기록 TOP 조회에 실패했습니다.'
      };
    }
  });
