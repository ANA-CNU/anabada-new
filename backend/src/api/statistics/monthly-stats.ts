import { Elysia } from "elysia";
import type {
  Clock,
  KstCalendar,
  KstMonthBucket,
} from "../../infrastructure/time.js";

type MonthlyStat = Readonly<{ date: string; solved_problem: number }>;
export interface StatisticsService {
  monthlyStats(
    buckets: readonly KstMonthBucket[],
  ): Promise<readonly MonthlyStat[]>;
  totalProblems(): Promise<number>;
}

export const createStatisticsRoutes = (
  dependencies: Readonly<{
    service: StatisticsService;
    calendar: KstCalendar;
    clock: Clock;
  }>,
) =>
  new Elysia()
    .get("/api/statistics/monthly-problems", async () => {
      const now = dependencies.clock.now();
      const data = await dependencies.service.monthlyStats(
        dependencies.calendar.recentMonths(now),
      );
      return {
        success: true,
        data,
        message: "월별 문제 해결 통계 조회 성공",
        summary: {
          total_months: data.length,
          total_problems: data.reduce(
            (sum, row) => sum + row.solved_problem,
            0,
          ),
          period: "최근 1년",
        },
      };
    })
    .get("/api/statistics/total-problems", async () => ({
      success: true,
      data: { total_problems: await dependencies.service.totalProblems() },
      message: "전체 문제 수 조회 성공",
    }));
