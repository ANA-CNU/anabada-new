import { Elysia } from "elysia";
import { z } from "zod";
import { DatabaseQueryError } from "../../infrastructure/errors.js";
import {
  type UserDto,
  type UserPatch,
  userPatchSchema,
} from "../../infrastructure/mysql/repositories/contracts.js";

export interface UserStore {
  list(): Promise<readonly UserDto[]>;
  find(id: number): Promise<UserDto | undefined>;
  search(term: string): Promise<readonly UserDto[]>;
  update(id: number, patch: UserPatch): Promise<boolean>;
  remove(id: number): Promise<boolean>;
}
export interface AdminAuthorizer {
  authorize(request: Request): Promise<boolean> | boolean;
}
export class UserNotFoundError extends Error {
  readonly name = "UserNotFoundError";
}
export class UserConflictError extends Error {
  readonly name = "UserConflictError";
}
export class UserService {
  constructor(private readonly users: UserStore) {}
  list(): Promise<readonly UserDto[]> {
    return this.users.list();
  }
  search(term: string): Promise<readonly UserDto[]> {
    return this.users.search(term);
  }
  async find(id: number): Promise<UserDto> {
    const user = await this.users.find(id);
    if (!user) throw new UserNotFoundError();
    return user;
  }
  async update(id: number, patch: UserPatch): Promise<void> {
    try {
      if (!(await this.users.update(id, patch))) throw new UserNotFoundError();
    } catch (error) {
      if (
        error instanceof DatabaseQueryError &&
        error.vendorCode === "ER_DUP_ENTRY"
      )
        throw new UserConflictError();
      throw error;
    }
  }
  async remove(id: number): Promise<void> {
    if (!(await this.users.remove(id))) throw new UserNotFoundError();
  }
}
const idSchema = z.coerce.number().int().positive();
const numericInput = z
  .union([z.number(), z.string().regex(/^\d+$/)])
  .transform(Number);
const bigintInput = z.union([
  z.string().regex(/^\d+$/),
  z.bigint().transform(String),
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).transform(String),
]);
const requestPatchSchema = z
  .object({
    jungol_name: z.string().trim().min(1).max(50).optional(),
    corrects: numericInput.pipe(z.number().int().nonnegative()).optional(),
    submissions: numericInput.pipe(z.number().int().nonnegative()).optional(),
    solution: bigintInput.optional(),
    korean_name: z.string().trim().min(1).max(25).nullable().optional(),
    tier: numericInput.pipe(z.number().int().min(0).max(31)).optional(),
    ac_rating: numericInput.pipe(z.number().int().nonnegative()).optional(),
    ignored: z.boolean().optional(),
    jungol_account_id: bigintInput.optional(),
    rank_wrong_count: numericInput
      .pipe(z.number().int().nonnegative())
      .optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "An update field is required",
  );
const json = (status: number, body: object): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
export const createUserRoutes = (
  dependencies: Readonly<{
    service: UserService;
    adminAuthorizer: AdminAuthorizer;
  }>,
) =>
  new Elysia()
    .get("/api/users/all", async ({ request }) => {
      if (!(await dependencies.adminAuthorizer.authorize(request)))
        return json(401, { error: "관리자 권한이 없습니다." });
      const data = await dependencies.service.list();
      return {
        success: true,
        count: data.length,
        data,
        message: "전체 사용자 조회 성공",
      };
    })
    .get("/api/users/:id", async ({ params }) => {
      const parsed = idSchema.safeParse(params.id);
      if (!parsed.success)
        return json(400, { error: "유효한 사용자 ID가 필요합니다." });
      try {
        return {
          success: true,
          data: await dependencies.service.find(parsed.data),
        };
      } catch (error) {
        if (error instanceof UserNotFoundError)
          return json(404, { error: "사용자를 찾을 수 없습니다." });
        throw error;
      }
    })
    .put("/api/users/:id", async ({ request, params, body }) => {
      if (!(await dependencies.adminAuthorizer.authorize(request)))
        return json(401, { error: "관리자 권한이 없습니다." });
      const id = idSchema.safeParse(params.id);
      const patch = requestPatchSchema.safeParse(body);
      if (!id.success || !patch.success)
        return json(400, { error: "유효하지 않은 요청입니다." });
      const normalized = userPatchSchema.safeParse(patch.data);
      if (!normalized.success)
        return json(400, { error: "유효하지 않은 요청입니다." });
      try {
        await dependencies.service.update(id.data, normalized.data);
        return { success: true, message: "수정 완료" };
      } catch (error) {
        if (error instanceof UserNotFoundError)
          return json(404, { error: "사용자를 찾을 수 없습니다." });
        if (error instanceof UserConflictError)
          return json(409, { error: "이미 존재하는 사용자 정보입니다." });
        throw error;
      }
    })
    .delete("/api/users/:id", async ({ request, params }) => {
      if (!(await dependencies.adminAuthorizer.authorize(request)))
        return json(401, { error: "관리자 권한이 없습니다." });
      const id = idSchema.safeParse(params.id);
      if (!id.success)
        return json(400, { error: "유효한 사용자 ID가 필요합니다." });
      try {
        await dependencies.service.remove(id.data);
        return { success: true, message: "삭제 완료" };
      } catch (error) {
        if (error instanceof UserNotFoundError)
          return json(404, { error: "사용자를 찾을 수 없습니다." });
        throw error;
      }
    });
