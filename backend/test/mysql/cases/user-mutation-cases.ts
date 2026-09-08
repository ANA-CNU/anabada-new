import { expect } from "bun:test";
import type { MysqlTestContext } from "../context.js";
import {
  expectUserActivityOperations,
  userDependentCount,
  userMutation,
  userRequest,
  userRow,
} from "./user-test-support.js";

export async function runUserMutationCases(
  context: MysqlTestContext,
): Promise<void> {
  await context.seed();
  const patch = {
    jungol_name: "alpha-renamed",
    corrects: 9,
    submissions: 10,
    solution: "9007199254740993",
    korean_name: "새이름",
    tier: 31,
    ac_rating: 2000,
    ignored: true,
    jungol_account_id: "9007199254740994",
    rank_wrong_count: 7,
  };
  const update = await userRequest(
    context,
    "/api/users/1",
    userMutation("PUT", patch),
  );
  expect(update.status).toBe(200);
  expect(await update.json()).toEqual({ success: true, message: "수정 완료" });
  expect(await userRow(context, 1)).toEqual({ ...patch, ignored: 1 });
  const beforeConflict = await userRow(context, 1);
  expect(
    (
      await userRequest(
        context,
        "/api/users/1",
        userMutation("PUT", { jungol_name: "beta" }),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await userRequest(
        context,
        "/api/users/1",
        userMutation("PUT", { jungol_account_id: "9002" }),
      )
    ).status,
  ).toBe(409);
  expect(await userRow(context, 1)).toEqual(beforeConflict);
  for (const invalid of [
    {},
    { jungol_name: "  " },
    { tier: 32 },
    { solution: "not-a-bigint" },
    { jungol_account_id: -1 },
  ]) {
    expect(
      (await userRequest(context, "/api/users/1", userMutation("PUT", invalid)))
        .status,
    ).toBe(400);
  }
  await context.seed();
  const remove = await userRequest(
    context,
    "/api/users/1",
    userMutation("DELETE"),
  );
  expect(remove.status).toBe(200);
  expect(await remove.json()).toEqual({ success: true, message: "삭제 완료" });
  expect(
    await Promise.all([
      userDependentCount(context, "problem", 1),
      userDependentCount(context, "score_history", 1),
      userDependentCount(context, "ranked_users", 1),
      userDependentCount(context, "user_bias_total", 1),
    ]),
  ).toEqual([0, 0, 0, 0]);
  await context.seed();
  expect(
    (await userRequest(context, "/api/users/999", userMutation("DELETE")))
      .status,
  ).toBe(404);
  expectUserActivityOperations(context);
}
