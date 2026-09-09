import { Elysia } from "elysia";
import { z } from "zod";
import type { UserDto } from "../../infrastructure/mysql/repositories/contracts.js";
const querySchema = z.object({ q: z.string().trim().min(1).max(50) });
export interface UserSearchService {
  search(term: string): Promise<readonly UserDto[]>;
}
export const createUserSearchRoutes = (service: UserSearchService) =>
  new Elysia().get("/api/user/search", async ({ query }) => {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success)
      return new Response(JSON.stringify({ error: "검색어가 필요합니다." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    return service.search(parsed.data.q);
  });
