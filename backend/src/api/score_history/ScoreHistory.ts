import { Elysia } from "elysia";
import { getDatabase } from "../../db/database.js";
import { logger } from "../../index.js";
import { checkAdminAuth } from "../../auth.js";

type ScoreHistoryRecord = {
	username: string;
	bias: number;
	desc: string;
	eventId?: number | null;
	problemId?: number | null;
};

const isProduction = process.env.NODE_ENV === 'production';

export const scoreHistory = new Elysia()
	.post("/api/score-history/bulk", async ({ body, request }) => {
        if (isProduction && !checkAdminAuth(request).isAuthenticated) {
            return {
                success: false,
                message: "관리자 권한이 없습니다.",
            };
        }

        logger.info("score-history/bulk 요청 수신");
        logger.info(body);
        
		try {
			const payload = body as { records?: ScoreHistoryRecord[] } | ScoreHistoryRecord[];
			const records: ScoreHistoryRecord[] = Array.isArray(payload)
				? payload
				: Array.isArray((payload as any)?.records)
				? ((payload as any).records as ScoreHistoryRecord[])
				: [];

			if (!Array.isArray(records) || records.length === 0) {
				return {
					success: false,
					message: "records 배열이 비어있습니다.",
				};
			}

			const db = getDatabase();
			const connection = await db.getConnection();
			try {
				await connection.beginTransaction();

				// 사용자 이름을 먼저 모아 한번에 조회 (성능 최적화)
				const uniqueUsernames = Array.from(new Set(records.map(r => r.username))).filter(Boolean);
				let nameToUserId = new Map<string, number>();
				if (uniqueUsernames.length > 0) {
					const placeholders = uniqueUsernames.map(() => "?").join(",");
					const [users] = await connection.query(
						`SELECT id, name FROM user WHERE name IN (${placeholders})`,
						uniqueUsernames
					);
					for (const row of users as any[]) {
						nameToUserId.set(row.name, row.id);
					}
				}

				let insertedCount = 0;
				const failed: Array<{ username: string; reason: string }> = [];

				for (const rec of records) {
					const userId = nameToUserId.get(rec.username);
					if (!userId) {
						failed.push({ username: rec.username, reason: "해당 이름의 사용자가 존재하지 않습니다." });
						continue;
					}

					// INSERT score_history
					await connection.query(
						`INSERT INTO score_history (user_id, \`desc\`, bias, event_id, problem_id) VALUES (?, ?, ?, ?, ?)`,
						[
							userId,
							rec.desc ?? null,
							Number(rec.bias) || 0,
							rec.eventId ?? null,
							rec.problemId ?? null,
						]
					);
					insertedCount += 1;
				}

				await connection.commit();

				return {
					success: true,
					insertedCount,
					failed,
					message: `score_history ${insertedCount}건 입력 완료 (${failed.length}건 실패)`,
				};
			} catch (err: any) {
				await connection.rollback();
				logger.error("score_history 일괄 입력 실패", err);
				return {
					success: false,
					error: err?.message ?? String(err),
					message: "score_history 일괄 입력 중 오류가 발생했습니다.",
				};
			} finally {
				connection.release();
			}
		} catch (error: any) {
			logger.error("score_history/bulk 요청 처리 실패", error);
			return {
				success: false,
				error: error?.message ?? String(error),
				message: "요청 처리에 실패했습니다.",
			};
		}
	});


