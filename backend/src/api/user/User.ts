import { Elysia } from "elysia";
import { getDatabase } from "../../db/database.js";
import { logger } from "../../index.js";
import { checkAdminAuth } from "../../auth.js";

const isProduction = process.env.NODE_ENV === 'production';

export const users = new Elysia()
	.get('/api/users/all', async ({ request }) => {
		if (isProduction && !checkAdminAuth(request).isAuthenticated) {
			return {
				success: false,
				message: '관리자 권한이 없습니다.'
			};
		}

		try {
			const db = getDatabase();
			const sql = `
				SELECT 
					id,
					name,
					corrects,
					submissions,
					solution,
					kr_name,
					atcoder_handle,
					codeforces_handle,
					tier,
					ignored
				FROM user
			`;
			logger.debug(`SQL QUERY: ${sql}`);
			const [rows] = await db.query(sql);
			return {
				success: true,
				count: (rows as any[]).length,
				data: rows,
				message: '전체 사용자 조회 성공'
			};
		} catch (error: any) {
			logger.error('전체 사용자 조회 실패:', error);
			return {
				success: false,
				error: error.message,
				message: '전체 사용자 조회 중 오류가 발생했습니다.'
			};
		}
	});


