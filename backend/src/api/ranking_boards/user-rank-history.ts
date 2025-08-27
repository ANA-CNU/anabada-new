import { Elysia } from 'elysia';
import { getDatabase } from '../../db/database.js';
import { logger } from '../../index.js';
import { RowDataPacket } from 'mysql2';

export const userRankHistory = new Elysia()
  .get('/api/board/user/:userId/rank-history', async ({ params }) => {
    try {
      const { userId } = params;

      if (!userId || isNaN(Number(userId))) {
        return new Response(JSON.stringify({ error: '유효한 사용자 ID가 필요합니다.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const db = getDatabase();
      const sql = `
        SELECT 
          rb.id AS board_id,
          rb.created_at AS created_at,
          ru.rank AS \`rank\`
        FROM ranked_users ru
        JOIN ranking_boards rb ON ru.board_id = rb.id
        WHERE ru.user_id = ?
        ORDER BY rb.created_at ASC
        LIMIT 200
      `;

      const [rows] = await db.execute<RowDataPacket[]>(sql, [userId]);
      return rows;
    } catch (error) {
      console.error('사용자 랭킹 히스토리 조회 중 오류:', error);
      return new Response(JSON.stringify({ error: '서버 오류가 발생했습니다.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
