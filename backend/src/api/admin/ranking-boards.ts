import { Elysia } from "elysia";
import { z } from "zod";
import type { AdminAuthorizer } from "../../auth.js";
import type { RankingRepository } from "../../infrastructure/mysql/repositories/ranking-repository.js";
import type { AdminRankingBoardService } from "./ranking-board-service.js";

const safePositiveInteger = z
  .union([
    z
      .string()
      .regex(/^[1-9]\d{0,9}$/)
      .transform(Number),
    z.number(),
  ])
  .pipe(z.number().int().positive().max(2_147_483_647));
const pageLimitInteger = z
  .union([
    z
      .string()
      .regex(/^[1-9]\d{0,2}$/)
      .transform(Number),
    z.number(),
  ])
  .pipe(z.number().int().positive().max(100));
const listQuerySchema = z
  .object({
    page: safePositiveInteger.default(1),
    limit: pageLimitInteger.default(10),
  })
  .strict();
const idSchema = safePositiveInteger;
const activeBodySchema = z.object({ is_active: z.boolean() }).strict();
const unauthorized = {
  success: false,
  message: "관리자 권한이 필요합니다.",
} as const;
const invalid = {
  success: false,
  message: "유효한 요청 값이 필요합니다.",
} as const;
const missing = {
  success: false,
  message: "랭킹 보드를 찾을 수 없습니다.",
} as const;

export type AdminRankingBoardRouteDependencies = Readonly<{
  readonly withRepository: <T>(
    work: (repository: RankingRepository) => Promise<T>,
  ) => Promise<T>;
  readonly service: AdminRankingBoardService;
  readonly authorizer: AdminAuthorizer;
}>;

export function createAdminRankingBoardRoutes(
  dependencies: AdminRankingBoardRouteDependencies,
) {
  return new Elysia()
    .get("/api/admin/ranking-boards", async ({ query, request, set }) => {
      if (!dependencies.authorizer.isAdmin(request)) {
        set.status = 401;
        return unauthorized;
      }
      const parsed = listQuerySchema.safeParse(query);
      if (!parsed.success) {
        set.status = 400;
        return invalid;
      }
      const offset = (parsed.data.page - 1) * parsed.data.limit;
      const [data, total] = await dependencies.withRepository(
        async (repository) =>
          Promise.all([
            repository.adminBoards(parsed.data.limit, offset),
            repository.adminBoardCount(),
          ]),
      );
      return {
        success: true,
        data,
        pagination: {
          page: parsed.data.page,
          limit: parsed.data.limit,
          total,
          total_pages: Math.ceil(total / parsed.data.limit),
        },
      };
    })
    .get("/api/admin/ranking-boards/:id", async ({ params, request, set }) => {
      if (!dependencies.authorizer.isAdmin(request)) {
        set.status = 401;
        return unauthorized;
      }
      const parsed = idSchema.safeParse(params.id);
      if (!parsed.success) {
        set.status = 400;
        return invalid;
      }
      const result = await dependencies.withRepository(async (repository) => {
        const board = await repository.adminBoard(parsed.data);
        return board
          ? { board, members: await repository.adminBoardMembers(parsed.data) }
          : null;
      });
      if (!result) {
        set.status = 404;
        return missing;
      }
      return { success: true, data: result };
    })
    .patch(
      "/api/admin/ranking-boards/:id/active",
      async ({ params, body, request, set }) => {
        if (!dependencies.authorizer.isAdmin(request)) {
          set.status = 401;
          return unauthorized;
        }
        const id = idSchema.safeParse(params.id);
        const active = activeBodySchema.safeParse(body);
        if (!id.success || !active.success) {
          set.status = 400;
          return invalid;
        }
        const found = await dependencies.service.setActive(
          id.data,
          active.data.is_active,
        );
        if (!found) {
          set.status = 404;
          return missing;
        }
        return {
          success: true,
          message: active.data.is_active
            ? "랭킹 보드가 활성화되었습니다."
            : "랭킹 보드가 비활성화되었습니다.",
        };
      },
    );
}
