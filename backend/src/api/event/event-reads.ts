import { Elysia } from "elysia";
import type { EventRepository } from "../../infrastructure/mysql/repositories/event-repository.js";
import { parseEventId } from "./event-input.js";

export interface EventReadSessionFactory {
  withSession<T>(work: (repository: EventRepository) => Promise<T>): Promise<T>;
}
const utc = (date: Date): string => date.toISOString();
const pageValue = (
  value: string | undefined,
  fallback: number,
  maximum: number,
): number => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
};

export function createEventReads(factory: EventReadSessionFactory) {
  const recent = async (ongoing: boolean) =>
    factory.withSession(async (repository) => {
      const rows = await repository.recent(ongoing);
      return {
        success: true,
        data: rows.map((row) => ({
          event_title: row.event_title,
          startDate: utc(row.begin),
          endDate: utc(row.end),
          problems: row.problems,
        })),
        message: `${ongoing ? "현재 진행중인" : "과거 진행된"} 이벤트 조회 성공`,
        summary: {
          count: rows.length,
          status: ongoing ? "진행중" : "종료됨",
          max_limit: 3,
        },
      };
    });
  return new Elysia()
    .get("/api/events/ongoing", () => recent(true))
    .get("/api/events/past", () => recent(false))
    .get("/api/events", ({ query }) =>
      factory.withSession(async (repository) => {
        const page = pageValue(query.page, 1, Number.MAX_SAFE_INTEGER);
        const limit = pageValue(query.limit, 10, 100);
        const [total, rows] = await Promise.all([
          repository.count(),
          repository.list(limit, (page - 1) * limit),
        ]);
        return {
          success: true,
          data: rows.map((row) => ({
            ...row,
            begin: utc(row.begin),
            end: utc(row.end),
            created_at: utc(row.created_at),
          })),
          pagination: {
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit),
          },
          message: "이벤트 목록 조회 성공",
        };
      }),
    )
    .get("/api/events/:id", async ({ params, set }) => {
      const id = parseEventId(params.id);
      if (id === null) {
        set.status = 400;
        return { success: false, message: "유효하지 않은 이벤트 ID입니다." };
      }
      return factory.withSession(async (repository) => {
        const event = await repository.find(id);
        if (!event) {
          set.status = 404;
          return { success: false, message: "해당 이벤트를 찾을 수 없습니다." };
        }
        return {
          success: true,
          data: {
            ...event,
            begin: utc(event.begin),
            end: utc(event.end),
            created_at: utc(event.created_at),
            problems: await repository.problems(id),
          },
          message: "이벤트 상세 조회 성공",
        };
      });
    });
}
