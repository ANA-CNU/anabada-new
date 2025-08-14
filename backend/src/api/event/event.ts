import { Elysia } from "elysia";
import { getDatabase } from "../../db/database.js";
import { logger } from "../../index.js";

export const event = new Elysia()
  .get('/api/events/ongoing', async () => {
    try {
      const db = getDatabase();

      const sql = `
        SELECT 
          e.title AS event_title,
          e.begin AS startDate,
          e.end AS endDate,
          GROUP_CONCAT(ep.problem ORDER BY ep.id) AS problems
        FROM event e
        LEFT JOIN event_problem ep ON e.id = ep.event_id
        WHERE e.begin <= NOW()
          AND e.end >= NOW()
        GROUP BY e.id
        ORDER BY e.end ASC
        LIMIT 3
      `;

      logger.debug(`SQL QUERY: ${sql}`);

      const [rows] = await db.execute(sql);
      const data = rows as any[];
      logger.debug('현재 진행중인 이벤트 조회 성공');

      return {
        success: true,
        data: data,
        message: '현재 진행중인 이벤트 조회 성공',
        summary: {
          count: data.length,
          status: '진행중',
          max_limit: 3
        }
      };

    } catch (error: any) {
      logger.error('현재 진행중인 이벤트 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '현재 진행중인 이벤트 조회에 실패했습니다.'
      };
    }
  })

  .get('/api/events/past', async () => {
    try {
      const db = getDatabase();

      const sql = `
        SELECT 
          e.title AS event_title,
          e.begin AS startDate,
          e.end AS endDate,
          GROUP_CONCAT(ep.problem ORDER BY ep.id) AS problems
        FROM event e
        LEFT JOIN event_problem ep ON e.id = ep.event_id
        WHERE e.end < NOW()
        GROUP BY e.id
        ORDER BY e.end DESC
        LIMIT 3
      `;

      logger.debug(`SQL QUERY: ${sql}`);

      const [rows] = await db.execute(sql);
      const data = rows as any[];
      logger.debug('과거 진행된 이벤트 조회 성공');

      return {
        success: true,
        data: data,
        message: '과거 진행된 이벤트 조회 성공',
        summary: {
          count: data.length,
          status: '종료됨',
          max_limit: 3
        }
      };

    } catch (error: any) {
      logger.error('과거 진행된 이벤트 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '과거 진행된 이벤트 조회에 실패했습니다.'
      };
    }
  });
