import { Elysia } from "elysia";
import { z } from "zod";
import type { ScoreHistoryService } from "./score-history-service.js";

const decimalId = z.string().regex(/^\d+$/);
const recordSchema = z
  .object({
    user_id: z.number().int().positive(),
    bias: z.number().int(),
    desc: z.string().nullable(),
    event_id: z.number().int().positive().nullable(),
    problem_id: decimalId.nullable(),
  })
  .strict();
const bulkSchema = z
  .object({ records: z.array(recordSchema).min(1).max(1_000) })
  .strict();
const patchSchema = z
  .object({
    desc: z.string().nullable().optional(),
    bias: z.number().int().optional(),
    event_id: z.number().int().positive().nullable().optional(),
    problem_id: decimalId.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  username: z.string().trim().min(1).max(100).optional(),
});
const idSchema = z.coerce.number().int().positive();
const unauthorized = { success: false, message: "관리자 권한이 없습니다." };

export type ScoreHistoryRouteDependencies = Readonly<{
  service: ScoreHistoryService;
  authorize: (request: Request) => boolean;
}>;
export function createScoreHistoryRoutes(
  dependencies: ScoreHistoryRouteDependencies,
) {
  return new Elysia()
    .post("/api/score-history/bulk", async ({ body, request, set }) => {
      if (!dependencies.authorize(request)) {
        set.status = 401;
        return unauthorized;
      }
      const parsed = bulkSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { success: false, message: "유효하지 않은 records 입니다." };
      }
      const result = await dependencies.service.bulk(parsed.data.records);
      return {
        success: true,
        ...result,
        message: `score_history ${result.insertedCount}건 입력 완료 (${result.failed.length}건 실패)`,
      };
    })
    .get("/api/admin/score-history", async ({ query, request, set }) => {
      if (!dependencies.authorize(request)) {
        set.status = 401;
        return unauthorized;
      }
      const parsed = querySchema.safeParse(query);
      if (!parsed.success) {
        set.status = 400;
        return { success: false, message: "유효하지 않은 페이지 요청입니다." };
      }
      const result = await dependencies.service.list(
        parsed.data.page,
        parsed.data.limit,
        parsed.data.username,
      );
      return {
        success: true,
        data: result.data,
        pagination: {
          page: parsed.data.page,
          limit: parsed.data.limit,
          total: result.total,
          total_pages: Math.ceil(result.total / parsed.data.limit),
        },
      };
    })
    .put("/api/score-history/:id", async ({ body, params, request, set }) => {
      if (!dependencies.authorize(request)) {
        set.status = 401;
        return unauthorized;
      }
      const id = idSchema.safeParse(params.id);
      const patch = patchSchema.safeParse(body);
      if (!id.success || !patch.success) {
        set.status = 400;
        return { success: false, message: "유효하지 않은 수정 요청입니다." };
      }
      if (!(await dependencies.service.update(id.data, patch.data))) {
        set.status = 404;
        return { success: false, message: "score_history를 찾을 수 없습니다." };
      }
      return { success: true, message: "수정 완료" };
    })
    .delete("/api/score-history/:id", async ({ params, request, set }) => {
      if (!dependencies.authorize(request)) {
        set.status = 401;
        return unauthorized;
      }
      const id = idSchema.safeParse(params.id);
      if (!id.success) {
        set.status = 400;
        return { success: false, message: "유효하지 않은 id 입니다." };
      }
      if (!(await dependencies.service.remove(id.data))) {
        set.status = 404;
        return { success: false, message: "score_history를 찾을 수 없습니다." };
      }
      return { success: true, message: "삭제 완료" };
    });
}
