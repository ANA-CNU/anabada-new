import { Elysia } from 'elysia';
import { getDatabase } from '../../db/database.js';

export const userSearch = new Elysia()
  .get('/api/user/search', async ({ query }) => {
    try {
      const { q } = query;
      
      if (!q || typeof q !== 'string') {
        return new Response(JSON.stringify({ error: '검색어가 필요합니다.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const searchTerm = `%${q}%`;
      const db = getDatabase();
      
      const query_sql = `
        SELECT id, name, kr_name, corrects, submissions, solution, tier, 
               atcoder_handle, codeforces_handle
        FROM user 
        WHERE (name LIKE ? OR kr_name LIKE ?) 
          AND ignored = 0
        ORDER BY tier DESC, corrects DESC
        LIMIT 50
      `;

      const [rows] = await db.execute(query_sql, [searchTerm, searchTerm]) as any[];
      
      return rows;
    } catch (error) {
      console.error('사용자 검색 중 오류:', error);
      return new Response(JSON.stringify({ error: '서버 오류가 발생했습니다.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
