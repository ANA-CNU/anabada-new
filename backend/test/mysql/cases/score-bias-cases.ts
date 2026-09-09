import { expect } from "bun:test";
import { sqlOperations } from "../../../src/infrastructure/mysql/database-session.js";
import type { MysqlTestContext } from "../context.js";
import { runBiasCases } from "./bias-cases.js";
import {
  jsonScoreRequest,
  scoreCount,
  scoreRows,
} from "./score-test-support.js";

export async function runScoreBiasCases(
  context: MysqlTestContext,
): Promise<void> {
  await context.seed();
  await context.rawPool.execute(
    "INSERT INTO user (id, jungol_name, corrects, submissions, solution, korean_name, tier, ac_rating, ignored, jungol_account_id, rank_wrong_count) VALUES (4, 'delta', 0, 0, 1004, NULL, 4, 400, 0, 9004, 0)",
  );
  const scoreCountBeforeInvalidBulk = await scoreCount(context);
  const invalidBulk = await context.handle(
    jsonScoreRequest("/api/score-history/bulk", "POST", {
      records: [
        {
          user_id: 1,
          bias: 1,
          desc: null,
          event_id: null,
          problem_id: 101,
        },
      ],
    }),
  );
  expect(invalidBulk.status).toBe(400);
  expect(await scoreCount(context)).toBe(scoreCountBeforeInvalidBulk);

  const bulk = await context.handle(
    jsonScoreRequest("/api/score-history/bulk", "POST", {
      records: [
        {
          user_id: 1,
          bias: 9,
          desc: "manual canonical",
          event_id: 201,
          problem_id: "101",
        },
        {
          user_id: 4,
          bias: -2,
          desc: "new user_id",
          event_id: null,
          problem_id: null,
        },
        { user_id: 999, bias: 1, desc: null, event_id: null, problem_id: null },
        { user_id: 1, bias: 1, desc: null, event_id: 999, problem_id: null },
        { user_id: 2, bias: 1, desc: null, event_id: null, problem_id: "101" },
        { user_id: 1, bias: 1, desc: null, event_id: 202, problem_id: "101" },
      ],
    }),
  );
  expect(context.incidents).toEqual([]);
  expect(bulk.status).toBe(200);
  expect(await bulk.json()).toMatchObject({
    success: true,
    insertedCount: 2,
    failed: [
      { user_id: 999, reason: "사용자가 존재하지 않습니다." },
      { user_id: 1, reason: "이벤트가 존재하지 않습니다." },
      { user_id: 2, reason: "문제가 존재하지 않거나 사용자 소유가 아닙니다." },
      { user_id: 1, reason: "문제가 이벤트에 연결되어 있지 않습니다." },
    ],
  });
  expect(await scoreRows(context, "manual canonical")).toEqual([
    expect.objectContaining({
      user_id: 1,
      bias: 9,
      rule_type: "manual",
      award_key: null,
      score_day: null,
      event_id: 201,
      problem_id: "101",
    }),
  ]);
  expect(await scoreRows(context, "new user_id")).toEqual([
    expect.objectContaining({ user_id: 4, bias: -2, rule_type: "manual" }),
  ]);
  expect(
    context.observedOperationIds.has(sqlOperations.scoreHistoryUserExists.id),
  ).toBe(true);
  expect(
    context.observedOperationIds.has(sqlOperations.scoreHistoryEventExists.id),
  ).toBe(true);
  expect(
    context.observedOperationIds.has(sqlOperations.scoreHistoryProblemOwner.id),
  ).toBe(true);
  expect(
    context.observedOperationIds.has(sqlOperations.scoreHistoryEventProblem.id),
  ).toBe(true);
  expect(
    context.observedOperationIds.has(sqlOperations.scoreHistoryInsert.id),
  ).toBe(true);

  const list = await context.handle(
    jsonScoreRequest(
      "/api/admin/score-history?page=1&limit=1&username=alpha",
      "GET",
    ),
  );
  expect(list.status).toBe(200);
  expect(await list.json()).toMatchObject({
    success: true,
    pagination: { page: 1, limit: 1, total: 4, total_pages: 4 },
    data: [
      {
        user_id: 1,
        display_name: "alpha",
        jungol_name: "alpha",
        korean_name: "가나다",
        rule_type: "manual",
        score_day: null,
        event_id: 201,
        problem_id: "101",
      },
    ],
  });
  expect(
    context.observedOperationIds.has(sqlOperations.scoreHistoryCount.id),
  ).toBe(true);
  expect(
    context.observedOperationIds.has(sqlOperations.scoreHistoryList.id),
  ).toBe(true);

  const canonicalRows = await scoreRows(context, "manual canonical");
  const canonical = canonicalRows[0];
  if (canonical === undefined)
    throw new Error("missing canonical score fixture");
  const update = await context.handle(
    jsonScoreRequest(`/api/score-history/${canonical.id}`, "PUT", {
      desc: "manual updated",
      bias: 12,
    }),
  );
  expect(update.status).toBe(200);
  expect(await update.json()).toEqual({ success: true, message: "수정 완료" });
  expect(await scoreRows(context, "manual updated")).toEqual([
    expect.objectContaining({ id: canonical.id, bias: 12 }),
  ]);
  const invalidPatch = await context.handle(
    jsonScoreRequest(`/api/score-history/${canonical.id}`, "PUT", {
      user_id: 2,
    }),
  );
  expect(invalidPatch.status).toBe(400);
  expect(await scoreRows(context, "manual updated")).toEqual([
    expect.objectContaining({ id: canonical.id, user_id: 1, bias: 12 }),
  ]);
  const missingUpdate = await context.handle(
    jsonScoreRequest("/api/score-history/999999", "PUT", { bias: 1 }),
  );
  expect(missingUpdate.status).toBe(404);
  expect(
    context.observedOperationIds.has(sqlOperations.scoreHistoryUpdate.id),
  ).toBe(true);
  const invalidDelete = await context.handle(
    jsonScoreRequest("/api/score-history/nope", "DELETE"),
  );
  expect(invalidDelete.status).toBe(400);
  const missingDelete = await context.handle(
    jsonScoreRequest("/api/score-history/999999", "DELETE"),
  );
  expect(missingDelete.status).toBe(404);
  const deletion = await context.handle(
    jsonScoreRequest(`/api/score-history/${canonical.id}`, "DELETE"),
  );
  expect(deletion.status).toBe(200);
  expect(await deletion.json()).toEqual({
    success: true,
    message: "삭제 완료",
  });
  expect(
    context.observedOperationIds.has(sqlOperations.scoreHistoryRemove.id),
  ).toBe(true);

  await context.seed();
  const countBeforeFailure = await scoreCount(context);
  await context.rawPool.query(
    "DROP TRIGGER IF EXISTS mysql_score_bias_bulk_failure",
  );
  await context.rawPool.query(
    "CREATE TRIGGER mysql_score_bias_bulk_failure BEFORE INSERT ON score_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced score bulk failure'",
  );
  try {
    const failedBulk = await context.handle(
      jsonScoreRequest("/api/score-history/bulk", "POST", {
        records: [
          {
            user_id: 1,
            bias: 2,
            desc: "must rollback one",
            event_id: null,
            problem_id: null,
          },
          {
            user_id: 2,
            bias: 3,
            desc: "must rollback two",
            event_id: null,
            problem_id: null,
          },
        ],
      }),
    );
    expect(failedBulk.status).toBe(503);
    expect(await scoreCount(context)).toBe(countBeforeFailure);
  } finally {
    await context.rawPool.query(
      "DROP TRIGGER IF EXISTS mysql_score_bias_bulk_failure",
    );
  }

  await runBiasCases(context);
}
