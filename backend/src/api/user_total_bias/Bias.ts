import { Elysia } from "elysia";
import { getDatabase } from "../../db/database.js";
import { logger } from "../../index.js";
import { checkAdminAuth } from "../../auth.js";

type DateInitBody = {
  begin: string; // ISO8601
  end: string;   // ISO8601
};

const isProduction = process.env.NODE_ENV === 'production';

export const bias = new Elysia()
  .post('/api/bias/date-init', async ({ request, body }) => {
    if (isProduction && !checkAdminAuth(request).isAuthenticated) {
      return { success: false, message: '관리자 권한이 없습니다.' };
    }

    try {
      const { begin, end } = (body as DateInitBody) || ({} as DateInitBody);
      if (!begin || !end) {
        return { success: false, message: 'begin, end 값을 YYYY-MM-DD HH:MM:SS 문자열로 전달해주세요.' };
      }

      // 기대 포맷: YYYY-MM-DD HH:MM:SS
      const DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
      if (!DATE_TIME_REGEX.test(begin) || !DATE_TIME_REGEX.test(end)) {
        return { success: false, message: 'begin/end는 YYYY-MM-DD HH:MM:SS 형식이어야 합니다.' };
      }

      // 문자열 비교 대신 안전하게 Date 비교 수행 (KST 가정)
      const beginTime = new Date(begin.replace(' ', 'T') + '+09:00').getTime();
      const endTime = new Date(end.replace(' ', 'T') + '+09:00').getTime();
      if (isNaN(beginTime) || isNaN(endTime)) {
        return { success: false, message: 'begin/end를 날짜로 해석할 수 없습니다.' };
      }
      if (beginTime > endTime) {
        return { success: false, message: 'begin은 end보다 이후일 수 없습니다.' };
      }

      const conn = await getDatabase().getConnection();
      try {
        await conn.beginTransaction();

        // 1) 전체 삭제
        await conn.execute('DELETE FROM user_bias_total');

        // 2) 기간 내 bias 합계 조회
        const selectSql = `
          SELECT user_id, COALESCE(SUM(bias), 0) AS total_point
          FROM score_history
          WHERE created_at >= ? AND created_at <= ?
          GROUP BY user_id
        `;
        // 드라이버 timezone이 +09:00으로 설정되어 있으므로 그대로 문자열 파라미터 사용
        const [rows] = await conn.execute(selectSql, [begin, end]);
        const aggregates = (rows as any[]).map(r => ({ user_id: r.user_id as number, total_point: Number(r.total_point) || 0 }));

        let insertedCount = 0;
        if (aggregates.length > 0) {
          // 3) 일괄 삽입
          const placeholders = aggregates.map(() => '(?, ?)').join(',');
          const params: any[] = [];
          for (const ag of aggregates) {
            params.push(ag.user_id, ag.total_point);
          }
          const insertSql = `INSERT INTO user_bias_total (user_id, total_point) VALUES ${placeholders}`;
          await conn.execute(insertSql, params);
          insertedCount = aggregates.length;
        }

        await conn.commit();
        return {
          success: true,
          message: 'user_bias_total 재계산 완료',
          insertedCount,
          range: { begin, end }
        };
      } catch (err: any) {
        await conn.rollback();
        logger.error('bias/date-init 처리 실패:', err);
        return { success: false, message: '재계산 중 오류가 발생했습니다.', error: err?.message ?? String(err) };
      } finally {
        conn.release();
      }
    } catch (error: any) {
      logger.error('bias/date-init 요청 실패:', error);
      return { success: false, message: '요청 처리에 실패했습니다.', error: error?.message ?? String(error) };
    }
  });

  // 전체 유저 가중치 목록
  // production에서는 관리자 인증 필요
  bias.get('/api/bias/all', async ({ request }) => {
    if (isProduction && !checkAdminAuth(request).isAuthenticated) {
      return { success: false, message: '관리자 권한이 없습니다.' };
    }

    try {
      const db = getDatabase();
      const sql = `
        SELECT 
          u.id AS user_id,
          u.name AS username,
          COALESCE(ubt.total_point, 0) AS total_point,
          ubt.updated_at
        FROM user u
        LEFT JOIN user_bias_total ubt ON ubt.user_id = u.id
        WHERE u.ignored = 0
        ORDER BY total_point DESC, u.name ASC
      `;
      const [rows] = await db.execute(sql);
      return { success: true, count: (rows as any[]).length, data: rows };
    } catch (error: any) {
      logger.error('bias/all 조회 실패:', error);
      return { success: false, message: '가중치 목록 조회 실패', error: error?.message ?? String(error) };
    }
  });


