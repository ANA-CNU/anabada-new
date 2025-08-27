import { Elysia } from 'elysia';
import { getDatabase } from '../../db/database.js';
import { RowDataPacket } from 'mysql2';
import { createSuccessResponse, createNotFoundResponse, createServerErrorResponse, createErrorResponse } from '../../utils/response.js';
import { isValidUserId } from '../../utils/validation.js';
import { MonthlySummary } from '../../types/index.js';
import { logger } from '../../index.js';

export const userMonthly = new Elysia()
  .get('/api/user/:userId/monthly-summary', async ({ params }) => {
    try {
      const userId = Number((params as any).userId);
      
      if (!isValidUserId(userId)) {
        return createErrorResponse('유효한 사용자 ID가 필요합니다.', 400);
      }

      const db = getDatabase();
      
      // 사용자 이름 조회
      const [userRows] = await db.execute<RowDataPacket[]>(
        'SELECT name FROM user WHERE id = ?', 
        [userId]
      );
      
      const userName = userRows[0]?.name;
      if (!userName) {
        return createNotFoundResponse('사용자를 찾을 수 없습니다.');
      }

      // 이번 달 시작/끝
      const [rangeRows] = await db.execute<RowDataPacket[]>(
        'SELECT DATE_FORMAT(CURRENT_DATE(), "%Y-%m-01") AS start_date, CURRENT_DATE() AS end_date'
      );
      
      const startDate = rangeRows[0].start_date;
      const endDate = rangeRows[0].end_date;

      // 월별 문제 풀이 수
      const [monthlySolved] = await db.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS solved_count
         FROM problem
         WHERE name = ? AND time >= DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01')
         AND repeatation = 0`,
        [userName]
      );

      // 월별 점수 합계
      const [monthlyScore] = await db.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(bias), 0) AS score_sum
         FROM score_history
         WHERE user_id = ? AND created_at >= DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01')`,
        [userId]
      );

      const monthlyData: MonthlySummary = {
        start_date: startDate,
        end_date: endDate,
        total_solved: Number(monthlySolved[0]?.solved_count || 0),
        total_score: Number(monthlyScore[0]?.score_sum || 0)
      };

      return createSuccessResponse(monthlyData);
    } catch (error) {
      console.error('월별 요약 조회 오류:', error);
      return createServerErrorResponse();
    }
  });
