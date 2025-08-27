import { Elysia } from 'elysia';
import { getDatabase } from '../../db/database.js';

export const userProblems = new Elysia()
  .get('/api/user/:userId/problems', async ({ params }) => {
    try {
      const { userId } = params;
      
      if (!userId || isNaN(Number(userId))) {
        return new Response(JSON.stringify({ error: '유효한 사용자 ID가 필요합니다.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const db = getDatabase();
      
      // 먼저 사용자 이름을 가져옵니다
      const userQuery = 'SELECT name FROM user WHERE id = ?';
      const [userRows] = await db.execute(userQuery, [userId]) as any[];
      
      if (!userRows || userRows.length === 0) {
        return new Response(JSON.stringify({ error: '사용자를 찾을 수 없습니다.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const userName = userRows[0].name;

      // 사용자가 해결한 문제 목록을 가져옵니다
      const problemsQuery = `
        SELECT p.id, p.name, p.problem_tier, p.level, p.time
        FROM problem p
        WHERE p.name = ?
        AND p.repeatation = 0
        ORDER BY p.time DESC
        LIMIT 50
      `;

      const [problemRows] = await db.execute(problemsQuery, [userName]) as any[];
      
      return problemRows;
    } catch (error) {
      console.error('사용자 문제 목록 조회 중 오류:', error);
      return new Response(JSON.stringify({ error: '서버 오류가 발생했습니다.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
