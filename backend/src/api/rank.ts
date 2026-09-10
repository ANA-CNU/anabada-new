import { Elysia } from "elysia";
import { z } from "zod";
import type {
  RankingRepository,
  RankingRepositoryFactory,
} from "../infrastructure/mysql/repositories/ranking-repository.js";
import type { Clock, KstCalendar } from "../infrastructure/time.js";

const userIdSchema = z.coerce.number().int().positive();
const pageSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});
const topSchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
});
export type RankingRouteDependencies = Readonly<{
  readonly withRepository: RankingRepositoryFactory["withRepository"];
  readonly clock: Clock;
  readonly calendar: KstCalendar;
}>;
function bad(): Response {
  return new Response(
    JSON.stringify({ error: "유효한 요청 값이 필요합니다." }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}
function range(d: RankingRouteDependencies) {
  return d.calendar.monthRange(d.clock.now());
}
function scoreMonthFromStart(start: Date): string {
  return new Date(start.getTime() + 9 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
}
function currentScoreMonth(d: RankingRouteDependencies): string {
  return scoreMonthFromStart(range(d)[0]);
}
function priorRange(d: RankingRouteDependencies) {
  const [start] = range(d);
  return d.calendar.monthRange(new Date(start.getTime() - 1));
}
function read<T>(
  d: RankingRouteDependencies,
  work: (r: RankingRepository) => Promise<T>,
) {
  return d.withRepository(work);
}
export function createRankingRoutes(d: RankingRouteDependencies) {
  return new Elysia()
    .get("/api/ranking/solved", async () => {
      const [s, e] = range(d);
      return {
        success: true,
        data: await read(d, (r) => r.solvedThisMonth(s, e)),
        message: "해결한 문제 랭킹 조회 성공",
      };
    })
    .get("/api/ranking/monthly-solved", async () => {
      const [s, e] = range(d);
      return {
        success: true,
        data: await read(d, (r) => r.monthlySolved(s, e)),
        message: "해결한 문제 랭킹 조회 성공",
      };
    })
    .get("/api/ranking/bias", async () => ({
      success: true,
      data: await read(d, (r) => r.bias(currentScoreMonth(d))),
      message: "가중치 랭킹 조회 성공",
    }))
    .get("/api/v2/ranking/bias", async () => {
      const [s, e] = range(d);
      return {
        success: true,
        data: await read(d, (r) => r.latestBias(s, e, scoreMonthFromStart(s))),
        message: "가중치 랭킹(v2) 조회 성공",
      };
    })
    .get("/api/board/latest", async () => ({
      success: true,
      data: await read(d, (r) => r.latestBoard(currentScoreMonth(d))),
      message: "최신 랭킹 보드 조회 성공",
    }))
    .get("/api/board/recently-date", async () => ({
      success: true,
      data: await read(d, (r) => r.latestBoardDate()),
      message: "최신 랭킹 보드 생성일시 조회 성공",
    }))
    .get("/api/board/top-gainers", async () => ({
      success: true,
      data: await read(d, (r) => r.topGainers(10)),
    }))
    .get("/api/board/user/:userId/rank-history", ({ params }) => {
      const p = userIdSchema.safeParse(params.userId);
      return p.success ? read(d, (r) => r.rankHistory(p.data, 200)) : bad();
    })
    .get("/api/ranking/selected-month-board", async () => {
      const [s, e] = priorRange(d);
      return {
        success: true,
        data: await read(d, (r) => r.selectedMonth(s, e, 7)),
        message: "지난달 랭킹 보드 조회 성공",
      };
    })
    .get("/api/statistics/recently-score", async ({ query }) => {
      const p = pageSchema.safeParse(query);
      if (!p.success) return bad();
      const offset = (p.data.page - 1) * p.data.limit;
      const data = await read(d, (r) => r.recentlyScore(p.data.limit, offset));
      return {
        success: true,
        data,
        message: `최근 점수 기록 페이지 ${p.data.page} 조회 성공`,
        summary: { count: data.length, limit: p.data.limit, page: p.data.page },
      };
    })
    .get("/api/statistics/recently-score/top", async ({ query }) => {
      const p = topSchema.safeParse(query);
      if (!p.success) return bad();
      const data = await read(d, (r) => r.recentScoreTop(p.data.limit));
      return {
        success: true,
        data,
        message: `최근 점수 기록 TOP ${p.data.limit} 조회 성공`,
        summary: { count: data.length, limit: p.data.limit },
      };
    })
    .get("/api/score_history/user/:userId", ({ params }) => {
      const p = userIdSchema.safeParse(params.userId);
      return p.success ? read(d, (r) => r.scoreHistory(p.data, 50)) : bad();
    });
}
