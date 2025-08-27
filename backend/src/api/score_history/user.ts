import { Elysia } from 'elysia';
import { getDatabase } from '../../db/database.js';

export const userScoreHistory = new Elysia()
  .get('/api/score_history/user/:userId', async ({ params }) => {
    try {
      const { userId } = params;
      
      if (!userId || isNaN(Number(userId))) {
        return new Response(JSON.stringify({ error: '유효한 사용자 ID가 필요합니다.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const db = getDatabase();
      const query = `
        SELECT sh.id, sh.desc, sh.bias, sh.event_id, sh.problem_id, sh.created_at
        FROM score_history sh
        WHERE sh.user_id = ?
        ORDER BY sh.created_at DESC
        LIMIT 50
      `;

      const [rows] = await db.execute(query, [userId]) as any[];
      
      return rows;
    } catch (error) {
      console.error('사용자 점수 히스토리 조회 중 오류:', error);
      return new Response(JSON.stringify({ error: '서버 오류가 발생했습니다.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
