import { expect } from "bun:test";
import type { MysqlTestContext } from "../context.js";

const baseUrl = "http://integration.test";

export async function getRankingResponse(
  context: MysqlTestContext,
  path: string,
): Promise<Response> {
  return context.handle(new Request(`${baseUrl}${path}`));
}

export async function expectRankingJson(
  context: MysqlTestContext,
  path: string,
  expected: unknown,
): Promise<void> {
  const response = await getRankingResponse(context, path);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(expected);
}
