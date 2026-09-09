import { Elysia } from "elysia";
import { z } from "zod";
import type { ProblemDto } from "../../infrastructure/mysql/repositories/contracts.js";
const idSchema = z.coerce.number().int().positive();
export interface UserProblemsService {
  findUser(id: number): Promise<unknown>;
  problemsForUser(id: number): Promise<readonly ProblemDto[]>;
}
export const createUserProblemRoutes = (service: UserProblemsService) =>
  new Elysia().get("/api/user/:userId/problems", async ({ params }) => {
    const parsed = idSchema.safeParse(params.userId);
    if (!parsed.success)
      return new Response(
        JSON.stringify({ error: "유효한 사용자 ID가 필요합니다." }),
        { status: 400 },
      );
    if (!(await service.findUser(parsed.data)))
      return new Response(
        JSON.stringify({ error: "사용자를 찾을 수 없습니다." }),
        { status: 404 },
      );
    return service.problemsForUser(parsed.data);
  });
