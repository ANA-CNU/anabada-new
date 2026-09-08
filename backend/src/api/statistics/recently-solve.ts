import { Elysia } from "elysia";
import { z } from "zod";
import type { RecentSolvedDto } from "../../infrastructure/mysql/repositories/contracts.js";
const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export interface RecentSolvedService {
  recentlySolved(
    limit: number,
    offset: number,
  ): Promise<readonly RecentSolvedDto[]>;
}
export const createActivityRoutes = (service: RecentSolvedService) =>
  new Elysia().get("/api/statistics/recently-solved", async ({ query }) => {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success)
      return new Response(
        JSON.stringify({ error: "유효하지 않은 페이지입니다." }),
        { status: 400 },
      );
    const { page, limit } = parsed.data;
    const data = await service.recentlySolved(limit, (page - 1) * limit);
    return {
      success: true,
      data,
      message: `최근 해결된 문제 페이지 ${page} 조회 성공`,
      summary: {
        count: data.length,
        description: "중복 제거된 최근 해결된 문제 목록",
        order: "해결 시간 기준 내림차순",
      },
    };
  });
