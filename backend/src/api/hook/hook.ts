import { Elysia } from "elysia";
import { z } from "zod";
import type { DatabaseExecutor } from "../../infrastructure/mysql/database-session.js";
import { HookRepository } from "../../infrastructure/mysql/repositories/hook-repository.js";

type HookId = Readonly<{ readonly id: number }>;
type HookPagination = Readonly<{
  readonly page: number;
  readonly limit: number;
}>;
type HookCreate = Readonly<{ readonly url: string; readonly ignored: boolean }>;
type HookUpdate = Readonly<{
  readonly url?: string;
  readonly ignored?: boolean;
}>;
const hookIdSchema: z.ZodType<HookId, z.ZodTypeDef, unknown> = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();
const paginationSchema: z.ZodType<HookPagination, z.ZodTypeDef, unknown> = z
  .object({
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
const hookUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "URL must use HTTP or HTTPS");
const createHookSchema: z.ZodType<HookCreate, z.ZodTypeDef, unknown> = z
  .object({ url: hookUrlSchema, ignored: z.boolean().default(false) })
  .strict();
const updateHookSchema: z.ZodType<HookUpdate, z.ZodTypeDef, unknown> = z
  .object({ url: hookUrlSchema.optional(), ignored: z.boolean().optional() })
  .strict()
  .refine(
    (value) => value.url !== undefined || value.ignored !== undefined,
    "At least one field is required",
  );

export type HookAuthorizer = (request: Request) => boolean | Promise<boolean>;
export type HookRoutesDependencies = Readonly<{
  readonly withSession: <T>(
    work: (session: DatabaseExecutor) => Promise<T>,
  ) => Promise<T>;
  readonly authorizer: HookAuthorizer;
}>;

const unauthorized = {
  success: false,
  message: "관리자 권한이 필요합니다.",
} as const;
const invalidInput = {
  success: false,
  message: "요청 값이 올바르지 않습니다.",
} as const;
const notFound = {
  success: false,
  message: "해당 Webhook을 찾을 수 없습니다.",
} as const;

function parse<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function createHookRoutes(dependencies: HookRoutesDependencies) {
  const authorize = async (request: Request): Promise<boolean> =>
    dependencies.authorizer(request);
  return new Elysia()
    .get("/api/hooks", async ({ query, request, set }) => {
      if (!(await authorize(request))) {
        set.status = 401;
        return unauthorized;
      }
      const pagination = parse<HookPagination>(paginationSchema, query);
      if (!pagination) {
        set.status = 400;
        return invalidInput;
      }
      return dependencies.withSession(async (session) => {
        const result = await new HookRepository(session).list(pagination);
        return {
          success: true,
          data: result.items,
          pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total: result.total,
            total_pages: Math.ceil(result.total / pagination.limit),
          },
          message: "Webhook 목록 조회 성공",
        };
      });
    })
    .get("/api/hooks/:id", async ({ params, request, set }) => {
      if (!(await authorize(request))) {
        set.status = 401;
        return unauthorized;
      }
      const parsed = parse<HookId>(hookIdSchema, params);
      if (!parsed) {
        set.status = 400;
        return invalidInput;
      }
      return dependencies.withSession(async (session) => {
        const hook = await new HookRepository(session).find(parsed.id);
        if (!hook) {
          set.status = 404;
          return notFound;
        }
        return { success: true, data: hook, message: "Webhook 상세 조회 성공" };
      });
    })
    .post("/api/hooks", async ({ body, request, set }) => {
      if (!(await authorize(request))) {
        set.status = 401;
        return unauthorized;
      }
      const input = parse<HookCreate>(createHookSchema, body);
      if (!input) {
        set.status = 400;
        return invalidInput;
      }
      return dependencies.withSession(async (session) => ({
        success: true,
        hook_id: await new HookRepository(session).create(input),
        message: "Webhook 생성 성공",
      }));
    })
    .put("/api/hooks/:id", async ({ params, body, request, set }) => {
      if (!(await authorize(request))) {
        set.status = 401;
        return unauthorized;
      }
      const parsed = parse<HookId>(hookIdSchema, params);
      const input = parse<HookUpdate>(updateHookSchema, body);
      if (!parsed || !input) {
        set.status = 400;
        return invalidInput;
      }
      return dependencies.withSession(async (session) => {
        if (!(await new HookRepository(session).update(parsed.id, input))) {
          set.status = 404;
          return notFound;
        }
        return {
          success: true,
          message: "Webhook이 성공적으로 수정되었습니다.",
        };
      });
    })
    .delete("/api/hooks/:id", async ({ params, request, set }) => {
      if (!(await authorize(request))) {
        set.status = 401;
        return unauthorized;
      }
      const parsed = parse<HookId>(hookIdSchema, params);
      if (!parsed) {
        set.status = 400;
        return invalidInput;
      }
      return dependencies.withSession(async (session) => {
        if (!(await new HookRepository(session).remove(parsed.id))) {
          set.status = 404;
          return notFound;
        }
        return {
          success: true,
          message: "Webhook이 성공적으로 삭제되었습니다.",
        };
      });
    })
    .patch("/api/hooks/:id/toggle", async ({ params, request, set }) => {
      if (!(await authorize(request))) {
        set.status = 401;
        return unauthorized;
      }
      const parsed = parse<HookId>(hookIdSchema, params);
      if (!parsed) {
        set.status = 400;
        return invalidInput;
      }
      return dependencies.withSession(async (session) => {
        if (!(await new HookRepository(session).toggle(parsed.id))) {
          set.status = 404;
          return notFound;
        }
        return { success: true, message: "Webhook 상태가 변경되었습니다." };
      });
    });
}
