import { expect } from "bun:test";
import type { MysqlTestContext } from "../context.js";
import {
  expectRankingJson,
  getRankingResponse,
} from "./ranking-test-support.js";

export async function runRankingScoreCases(
  context: MysqlTestContext,
): Promise<void> {
  await context.rawPool.execute(
    "INSERT INTO score_history (id, user_id, `desc`, bias, rule_type, award_key, score_day, event_id, problem_id, created_at) VALUES (405, 3, '제외 대상', 9, 'manual', NULL, NULL, NULL, 101, '2026-09-03 00:00:00')",
  );
  await expectRankingJson(
    context,
    "/api/statistics/recently-score?page=1&limit=2",
    {
      success: true,
      data: [
        {
          id: 403,
          display_name: "가나다",
          desc: "수동 차감",
          bias: -3,
          event_id: null,
          problem_id: null,
          created_at: "2026-09-02T00:00:00.000Z",
        },
        {
          id: 402,
          display_name: "가나다",
          desc: "이벤트",
          bias: 1,
          event_id: 201,
          problem_id: "101",
          created_at: "2026-09-01T00:00:01.000Z",
        },
      ],
      message: "최근 점수 기록 페이지 1 조회 성공",
      summary: { count: 2, limit: 2, page: 1 },
    },
  );
  await expectRankingJson(
    context,
    "/api/statistics/recently-score?page=2&limit=2",
    {
      success: true,
      data: [
        {
          id: 401,
          display_name: "가나다",
          desc: "일일",
          bias: 1,
          event_id: null,
          problem_id: "101",
          created_at: "2026-09-01T00:00:00.000Z",
        },
        {
          id: 404,
          display_name: "beta",
          desc: "지난달 일일",
          bias: 1,
          event_id: null,
          problem_id: "103",
          created_at: "2026-08-15T00:00:00.000Z",
        },
      ],
      message: "최근 점수 기록 페이지 2 조회 성공",
      summary: { count: 2, limit: 2, page: 2 },
    },
  );
  await expectRankingJson(
    context,
    "/api/statistics/recently-score/top?limit=1",
    {
      success: true,
      data: [
        {
          id: 405,
          display_name: "무시",
          desc: "제외 대상",
          bias: 9,
          event_id: null,
          problem_id: "101",
          created_at: "2026-09-03T00:00:00.000Z",
        },
      ],
      message: "최근 점수 기록 TOP 1 조회 성공",
      summary: { count: 1, limit: 1 },
    },
  );
  await expectRankingJson(context, "/api/score_history/user/1", [
    {
      id: 403,
      display_name: "가나다",
      desc: "수동 차감",
      bias: -3,
      event_id: null,
      problem_id: null,
      created_at: "2026-09-02T00:00:00.000Z",
    },
    {
      id: 402,
      display_name: "가나다",
      desc: "이벤트",
      bias: 1,
      event_id: 201,
      problem_id: "101",
      created_at: "2026-09-01T00:00:01.000Z",
    },
    {
      id: 401,
      display_name: "가나다",
      desc: "일일",
      bias: 1,
      event_id: null,
      problem_id: "101",
      created_at: "2026-09-01T00:00:00.000Z",
    },
  ]);
  for (const path of [
    "/api/board/user/0/rank-history",
    "/api/score_history/user/nope",
    "/api/statistics/recently-score?page=0",
    "/api/statistics/recently-score/top?limit=501",
  ]) {
    const response = await getRankingResponse(context, path);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "유효한 요청 값이 필요합니다.",
    });
  }
}
