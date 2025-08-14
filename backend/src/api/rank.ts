import { Elysia } from "elysia";
import { getDatabase } from "../db/database.js";
import { logger } from "../index.js";

export const rank = new Elysia()
  .get('/api/ranking/solved', async () => {
    try {
      const db = getDatabase();

      const sql = `
        SELECT 
          u.name AS username,
          u.tier,
          COUNT(p.id) AS solved
        FROM user u
        JOIN problem p ON p.name = u.name
        WHERE 
          p.repeatation = 0
          AND p.time >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')  -- 이번 달 1일부터
        GROUP BY u.id, u.name, u.tier
        HAVING solved > 0
        ORDER BY solved DESC, u.name ASC
      `;

      logger.debug(`SQL QUERY: ${sql}`);
      
      const [rows] = await db.execute(sql);
      logger.debug('DB 조회 성공 rank.ts:21');

      return {
        success: true,
        data: rows,
        message: '해결한 문제 랭킹 조회 성공'
      };

    } catch (error: any) {
      logger.error('해결한 문제 랭킹 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '해결한 문제 랭킹 조회에 실패했습니다.'
      };
    }
  })
  
  .get('/api/ranking/bias', async () => {
    try {
      const db = getDatabase();

      const sql = `
        SELECT 
          u.name AS username,
          u.tier,
          ub.total_point AS bias
        FROM user u
        JOIN user_bias_total ub ON u.id = ub.user_id
        WHERE ub.total_point > 0
        ORDER BY ub.total_point DESC
      `;

      logger.debug(`SQL QUERY: ${sql}`);
      
      const [rows] = await db.execute(sql);
      logger.debug('DB 조회 성공 rank.ts:59');

      return {
        success: true,
        data: rows,
        message: '가중치 랭킹 조회 성공'
      };

    } catch (error: any) {
      logger.error('가중치 랭킹 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '가중치 랭킹 조회에 실패했습니다.'
      };
    }
  });


