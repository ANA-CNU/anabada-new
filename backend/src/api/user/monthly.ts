import { Elysia } from "elysia";
import { z } from "zod";
import type { MonthlySummaryDto } from "../../infrastructure/mysql/repositories/contracts.js";
import type { Clock, KstCalendar } from "../../infrastructure/time.js";
const idSchema = z.coerce.number().int().positive();
export interface MonthlySummaryService {
  findUser(id: number): Promise<unknown>;
  monthlySummary(
    id: number,
    start: Date,
    end: Date,
    startDate: string,
    endDate: string,
  ): Promise<MonthlySummaryDto>;
}
const date = (value: Date): string =>
  value.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
export const createUserMonthlyRoutes = (
  dependencies: Readonly<{
    service: MonthlySummaryService;
    calendar: KstCalendar;
    clock: Clock;
  }>,
) =>
  new Elysia().get("/api/user/:userId/monthly-summary", async ({ params }) => {
    const id = idSchema.safeParse(params.userId);
    if (!id.success)
      return new Response(
        JSON.stringify({ error: "유효한 사용자 ID가 필요합니다." }),
        { status: 400 },
      );
    if (!(await dependencies.service.findUser(id.data)))
      return new Response(
        JSON.stringify({ error: "사용자를 찾을 수 없습니다." }),
        { status: 404 },
      );
    const now = dependencies.clock.now();
    const [start, end] = dependencies.calendar.monthRange(now);
    return {
      data: await dependencies.service.monthlySummary(
        id.data,
        start,
        end,
        date(start),
        date(now),
      ),
    };
  });
