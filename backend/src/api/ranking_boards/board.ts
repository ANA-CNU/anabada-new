import { Elysia } from "elysia";
import { getDatabase } from "../../db/database.js";
import { logger } from "../../index.js";

export const board = new Elysia()
  .get('/api/board/latest', async () => {
    try {
      const db = getDatabase();

      const sql = `
        SELECT 
          u.name AS username,
          u.tier,
          ub.total_point AS bias,
          ru.rank
        FROM ranked_users ru
        JOIN ranking_boards rb ON ru.board_id = rb.id
        JOIN user u ON ru.user_id = u.id
        LEFT JOIN user_bias_total ub ON u.id = ub.user_id
        WHERE rb.id = (
          SELECT id 
          FROM ranking_boards
          ORDER BY created_at DESC
          LIMIT 1
        )
        ORDER BY ru.rank ASC
      `;

      logger.debug(`SQL QUERY: ${sql}`);
      const [rows] = await db.execute(sql);
      logger.debug('DB 조회 성공 board.ts:25');

      return {
        success: true,
        data: rows,
        message: '최신 랭킹 보드 조회 성공'
      };

    } catch (error: any) {
      logger.error('최신 랭킹 보드 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '최신 랭킹 보드 조회에 실패했습니다.'
      };
    }
  })
  
  .get('/api/board/recently-date', async() => {
    try {
      const db = getDatabase();

      const sql = `
        SELECT 
          DATE_FORMAT(
            created_at,
            '%Y-%m-%dT%H:%i:%s.000+09:00'
          ) AS updatedAt
        FROM ranking_boards
        ORDER BY id DESC
        LIMIT 1
      `;

      logger.debug(`SQL QUERY: ${sql}`);
      const [rows] = await db.execute(sql);
      logger.debug('DB 조회 성공 board.ts:recently-date');

      if (Array.isArray(rows) && rows.length > 0) {
        return {
          success: true,
          data: rows
          ,
          message: '최신 랭킹 보드 생성일시 조회 성공'
        };
      } else {
        return {
          success: false,
          message: '랭킹 보드가 존재하지 않습니다.'
        };
      }

    } catch (error: any) {
      logger.error('최신 랭킹 보드 생성일시 조회 실패:', error);
      return {
        success: false,
        error: error.message,
        message: '최신 랭킹 보드 생성일시 조회에 실패했습니다.'
      };
    }
  });


