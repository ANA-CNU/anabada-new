import { Elysia } from 'elysia';
import { getDatabase } from '../../db/database.js';

export const topGainers = new Elysia()
  .get('/api/board/top-gainers', async () => {
    try {
      const db = getDatabase();

      // 최신 보드와 바로 이전 보드 ID 추출
      const [boardRows] = await db.execute<any[]>(
        `SELECT id FROM ranking_boards ORDER BY created_at DESC LIMIT 2`
      );
      if (!Array.isArray(boardRows) || boardRows.length < 2) {
        return [];
      }
      const latestId = boardRows[0].id;
      const prevId = boardRows[1].id;

      // 두 보드 간 순위 변동 계산
      const sql = `
        SELECT 
          u.id AS user_id,
          u.name AS username,
          u.tier AS tier,
          ru_latest.rank AS current_rank,
          ru_prev.rank AS prev_rank,
          (ru_prev.rank - ru_latest.rank) AS delta
        FROM ranked_users ru_latest
        JOIN ranked_users ru_prev ON ru_prev.user_id = ru_latest.user_id AND ru_prev.board_id = ?
        JOIN user u ON u.id = ru_latest.user_id
        WHERE ru_latest.board_id = ?
        ORDER BY delta DESC
        LIMIT 10;
      `;
      const [rows] = await db.execute<any[]>(sql, [prevId, latestId]);
      return rows;
    } catch (error) {
      console.error('상승 랭커 조회 오류:', error);
      return new Response(JSON.stringify({ error: '서버 오류' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
