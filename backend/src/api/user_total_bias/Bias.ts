import { Elysia } from "elysia";
import { z } from "zod";
import { isCurrentKstMonthWindow } from "./bias-service.js";

const kstDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
const dateInitSchema = z
  .object({ begin: kstDateTime, end: kstDateTime })
  .strict();
const unauthorized = { success: false, message: "관리자 권한이 없습니다." };
function parseKst(value: string): Date | null {
  const parts = value.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
  );
  if (parts === null) return null;
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
  const localAsUtc = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );
  if (
    localAsUtc.getUTCFullYear() !== year ||
    localAsUtc.getUTCMonth() !== month - 1 ||
    localAsUtc.getUTCDate() !== day ||
    localAsUtc.getUTCHours() !== hour ||
    localAsUtc.getUTCMinutes() !== minute ||
    localAsUtc.getUTCSeconds() !== second
  )
    return null;
  return new Date(localAsUtc.getTime() - 9 * 60 * 60 * 1000);
}
export type BiasRouteDependencies = Readonly<{
  service: Readonly<{
    initialize(beginUtc: Date, endUtc: Date): Promise<number | null>;
    list(): Promise<readonly unknown[]>;
  }>;
  authorize: (request: Request) => boolean;
  clock?: () => Date;
}>;
export function createBiasRoutes(dependencies: BiasRouteDependencies) {
  return new Elysia()
    .post("/api/bias/date-init", async ({ request, body, set }) => {
      if (!dependencies.authorize(request)) {
        set.status = 401;
        return unauthorized;
      }
      const parsed = dateInitSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return {
          success: false,
          message: "begin/end는 YYYY-MM-DD HH:MM:SS 형식이어야 합니다.",
        };
      }
      const begin = parseKst(parsed.data.begin);
      const end = parseKst(parsed.data.end);
      if (begin === null || end === null || begin >= end) {
        set.status = 400;
        return { success: false, message: "유효한 KST 기간을 전달해주세요." };
      }
      if (!isCurrentKstMonthWindow(begin, end, dependencies.clock?.() ?? new Date())) {
        set.status = 400;
        return {
          success: false,
          message: "현재 KST 월의 시작과 종료만 재계산할 수 있습니다.",
        };
      }
      const insertedCount = await dependencies.service.initialize(begin, end);
      if (insertedCount === null) {
        set.status = 400;
        return {
          success: false,
          message: "현재 KST 월의 시작과 종료만 재계산할 수 있습니다.",
        };
      }
      return {
        success: true,
        insertedCount,
        range: { begin: begin.toISOString(), end: end.toISOString() },
        message: "user_bias_total 재계산 완료",
      };
    })
    .get("/api/bias/all", async ({ request, set }) => {
      if (!dependencies.authorize(request)) {
        set.status = 401;
        return unauthorized;
      }
      const data = await dependencies.service.list();
      return { success: true, count: data.length, data };
    });
}
