import { Elysia } from "elysia";
import { getDatabase } from "../../db/database.js";
import { logger } from "../../index.js";
import { checkAdminAuth } from "../../auth.js";

type DateInitBody = {
	begin: string; // ISO8601
	end: string;   // ISO8601
};

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
	})

	// 단일 사용자 조회
	.get('/api/users/:id', async ({ params }) => {
		try {
			const id = Number((params as any).id);
			if (!Number.isFinite(id)) {
				return { success: false, message: '유효하지 않은 id 입니다.' };
			}
			const db = getDatabase();
			const sql = `
				SELECT id, name, corrects, submissions, solution, kr_name, atcoder_handle, codeforces_handle, tier, ignored
				FROM user WHERE id = ? LIMIT 1
			`;
			const [rows] = await db.execute(sql, [id]) as any[];
			const data = Array.isArray(rows) ? rows[0] : null;
			if (!data) return { success: false, message: '사용자를 찾을 수 없습니다.' };
			return { success: true, data };
		} catch (error: any) {
			logger.error('단일 사용자 조회 실패:', error);
			return { success: false, message: '조회 중 오류가 발생했습니다.', error: error?.message ?? String(error) };
		}
	})

	// 유저 수정
	.put('/api/users/:id', async ({ request, params, body }) => {
		if (isProduction && !checkAdminAuth(request).isAuthenticated) {
			return { success: false, message: '관리자 권한이 없습니다.' };
		}

		try {
			const id = Number((params as any).id);
			if (!Number.isFinite(id)) {
				return { success: false, message: '유효하지 않은 id 입니다.' };
			}

			const { name, corrects, submissions, solution, kr_name, atcoder_handle, codeforces_handle, tier, ignored } = (body as any) ?? {};
			const fields: string[] = [];
			const values: any[] = [];

			if (typeof name !== "undefined") { fields.push("name = ?"); values.push(name); }
			if (typeof corrects !== "undefined") { fields.push("corrects = ?"); values.push(Number(corrects) || 0); }
			if (typeof submissions !== "undefined") { fields.push("submissions = ?"); values.push(Number(submissions) || 0); }
			if (typeof solution !== "undefined") { fields.push("solution = ?"); values.push(Number(solution) || 0); }
			if (typeof kr_name !== "undefined") { fields.push("kr_name = ?"); values.push(kr_name ?? null); }
			if (typeof atcoder_handle !== "undefined") { fields.push("atcoder_handle = ?"); values.push(atcoder_handle ?? null); }
			if (typeof codeforces_handle !== "undefined") { fields.push("codeforces_handle = ?"); values.push(codeforces_handle ?? null); }
			if (typeof tier !== "undefined") { fields.push("tier = ?"); values.push(Number(tier) || 0); }
			if (typeof ignored !== "undefined") { fields.push("ignored = ?"); values.push(Boolean(ignored) ? 1 : 0); }

			if (fields.length === 0) {
				return { success: false, message: '수정할 필드가 없습니다.' };
			}

			const db = getDatabase();
			const sql = `UPDATE user SET ${fields.join(", ")} WHERE id = ?`;
			await db.execute(sql, [...values, id]);

			return { success: true, message: '수정 완료' };
		} catch (error: any) {
			logger.error('유저 수정 실패:', error);
			return { success: false, message: '수정 중 오류가 발생했습니다.', error: error?.message ?? String(error) };
		}
	})

	// 유저 삭제
	.delete('/api/users/:id', async ({ request, params }) => {
		if (isProduction && !checkAdminAuth(request).isAuthenticated) {
			return { success: false, message: '관리자 권한이 없습니다.' };
		}

		try {
			const id = Number((params as any).id);
			if (!Number.isFinite(id)) {
				return { success: false, message: '유효하지 않은 id 입니다.' };
			}

			const db = getDatabase();
			await db.execute(`DELETE FROM user WHERE id = ?`, [id]);
			return { success: true, message: '삭제 완료' };
		} catch (error: any) {
			logger.error('유저 삭제 실패:', error);
			return { success: false, message: '삭제 중 오류가 발생했습니다.', error: error?.message ?? String(error) };
		}
	});


