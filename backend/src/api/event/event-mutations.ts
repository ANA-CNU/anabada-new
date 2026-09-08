import { Elysia } from "elysia";
import {
  DatabaseContractError,
  DatabaseQueryError,
  DatabaseTransactionError,
} from "../../infrastructure/errors.js";
import { EventNotFoundError } from "./event-errors.js";
import { parseEventId, parseEventInput } from "./event-input.js";
import { EventInputPeriodError, type EventService } from "./event-service.js";

export interface AdminAuthorizer {
  isAdmin(request: Request): boolean | Promise<boolean>;
}
const unauthorized = {
  success: false,
  message: "관리자 권한이 필요합니다.",
} as const;
const invalid = {
  success: false,
  message: "필수 파라미터가 누락되었습니다. (title, begin, end, problems)",
} as const;
const invalidId = {
  success: false,
  message: "유효하지 않은 이벤트 ID입니다.",
} as const;
const failure = (
  error: unknown,
): Readonly<{ success: false; message: string }> => {
  if (error instanceof EventNotFoundError)
    return { success: false, message: error.message };
  if (error instanceof EventInputPeriodError) return invalid;
  throw error;
};
const databaseFailure = (error: unknown): boolean =>
  error instanceof DatabaseQueryError ||
  error instanceof DatabaseContractError ||
  error instanceof DatabaseTransactionError;

export function createEventMutations(
  service: EventService,
  authorizer: AdminAuthorizer,
) {
  return new Elysia()
    .post("/api/event/create", async ({ body, request, set }) => {
      if (!(await authorizer.isAdmin(request))) {
        set.status = 401;
        return unauthorized;
      }
      const input = parseEventInput(body, "create");
      if (!input) {
        set.status = 400;
        return invalid;
      }
      try {
        const eventId = await service.create(input);
        return {
          success: true,
          event_id: eventId,
          message: "이벤트 및 문제 등록 성공",
          problems_count: input.problems.length,
        };
      } catch (error) {
        if (databaseFailure(error)) throw error;
        set.status = 400;
        return failure(error);
      }
    })
    .put("/api/events/:id", async ({ params, body, request, set }) => {
      if (!(await authorizer.isAdmin(request))) {
        set.status = 401;
        return unauthorized;
      }
      const id = parseEventId(params.id);
      if (id === null) {
        set.status = 400;
        return invalidId;
      }
      const input = parseEventInput(body, "update");
      if (!input) {
        set.status = 400;
        return invalid;
      }
      try {
        await service.update(id, input);
        return {
          success: true,
          message: "이벤트가 성공적으로 수정되었습니다.",
        };
      } catch (error) {
        if (databaseFailure(error)) throw error;
        set.status = 400;
        return failure(error);
      }
    })
    .delete("/api/events/:id", async ({ params, request, set }) => {
      if (!(await authorizer.isAdmin(request))) {
        set.status = 401;
        return unauthorized;
      }
      const id = parseEventId(params.id);
      if (id === null) {
        set.status = 400;
        return invalidId;
      }
      try {
        await service.remove(id);
        return {
          success: true,
          message: "이벤트가 성공적으로 삭제되었습니다.",
        };
      } catch (error) {
        if (databaseFailure(error)) throw error;
        set.status = 404;
        return failure(error);
      }
    });
}
