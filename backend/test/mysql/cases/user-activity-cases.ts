import { expect } from "bun:test";
import type { MysqlTestContext } from "../context.js";
import { runUserMutationCases } from "./user-mutation-cases.js";
import { canonicalUserFields, userRequest } from "./user-test-support.js";

export async function runUserActivityCases(
  context: MysqlTestContext,
): Promise<void> {
  await context.seed();

  const all = await userRequest(context, "/api/users/all");
  expect(all.status).toBe(200);
  expect(await all.json()).toEqual({
    success: true,
    count: 3,
    data: [
      {
        id: 1,
        jungol_name: "alpha",
        korean_name: "가나다",
        corrects: 3,
        submissions: 4,
        solution: "1001",
        tier: 12,
        ac_rating: 1500,
        ignored: false,
        jungol_account_id: "9001",
        rank_wrong_count: 1,
      },
      {
        id: 2,
        jungol_name: "beta",
        korean_name: null,
        corrects: 2,
        submissions: 2,
        solution: "1002",
        tier: 8,
        ac_rating: 1200,
        ignored: false,
        jungol_account_id: "9002",
        rank_wrong_count: 0,
      },
      {
        id: 3,
        jungol_name: "ignored",
        korean_name: "무시",
        corrects: 1,
        submissions: 1,
        solution: "1003",
        tier: 1,
        ac_rating: 100,
        ignored: true,
        jungol_account_id: "9003",
        rank_wrong_count: 0,
      },
    ],
    message: "전체 사용자 조회 성공",
  });

  const detail = await userRequest(context, "/api/users/1");
  expect(detail.status).toBe(200);
  const detailBody = await detail.json();
  expect(detailBody).toEqual({
    success: true,
    data: expect.objectContaining({ id: 1, jungol_name: "alpha" }),
  });
  expect(Object.keys(detailBody.data).sort()).toEqual([...canonicalUserFields]);
  expect(detailBody.data).not.toHaveProperty("name");
  expect(detailBody.data).not.toHaveProperty("kr_name");
  expect(detailBody.data).not.toHaveProperty("time");

  const search = await userRequest(context, "/api/user/search?q=%25");
  expect(search.status).toBe(200);
  expect(await search.json()).toEqual([]);

  const problems = await userRequest(context, "/api/user/1/problems");
  expect(problems.status).toBe(200);
  expect(await problems.json()).toEqual([
    {
      id: "101",
      user_id: 1,
      problem: 1000,
      problem_name: "현재월",
      problem_tier: 12,
      submitted_at: "2026-09-01T00:00:00.000Z",
      level: 12,
      repeatation: 0,
      verdict: "accepted",
      external_submission_id: "5001",
      score: 12.5,
    },
  ]);

  const summary = await userRequest(context, "/api/user/1/monthly-summary");
  expect(summary.status).toBe(200);
  expect(await summary.json()).toEqual({
    data: {
      start_date: "2026-09-01",
      end_date: "2026-09-08",
      total_solved: 1,
      total_score: -1,
    },
  });

  const recent = await userRequest(
    context,
    "/api/statistics/recently-solved?limit=10",
  );
  expect(recent.status).toBe(200);
  expect(await recent.json()).toEqual({
    success: true,
    data: [
      {
        display_name: "alpha",
        jungol_name: "alpha",
        korean_name: "가나다",
        problem: 1000,
        problem_name: "현재월",
        submitted_at: "2026-09-01T00:00:00.000Z",
      },
      {
        display_name: "beta",
        jungol_name: "beta",
        korean_name: null,
        problem: 2000,
        problem_name: "지난달",
        submitted_at: "2026-08-15T00:00:00.000Z",
      },
      {
        display_name: "beta",
        jungol_name: "beta",
        korean_name: null,
        problem: 1970,
        problem_name: "요약 기준선",
        submitted_at: "1970-01-01T00:00:00.000Z",
      },
    ],
    message: "최근 해결된 문제 페이지 1 조회 성공",
    summary: {
      count: 3,
      description: "중복 제거된 최근 해결된 문제 목록",
      order: "해결 시간 기준 내림차순",
    },
  });

  await context.rawPool.execute(
    "INSERT INTO problem (id, user_id, problem, problem_name, problem_tier, submitted_at, level, repeatation, verdict, external_submission_id, score) VALUES (105, 2, 2001, 'KST 직전', 8, '2026-08-31 14:59:59.999', 8, 0, 'accepted', 5005, NULL), (106, 2, 2002, 'KST 시작', 8, '2026-08-31 15:00:00.000', 8, 0, 'accepted', 5006, NULL)",
  );
  const monthly = await userRequest(
    context,
    "/api/statistics/monthly-problems",
  );
  expect(monthly.status).toBe(200);
  expect(await monthly.json()).toEqual({
    success: true,
    data: [
      { date: "2025-10", solved_problem: 0 },
      { date: "2025-11", solved_problem: 0 },
      { date: "2025-12", solved_problem: 0 },
      { date: "2026-01", solved_problem: 0 },
      { date: "2026-02", solved_problem: 0 },
      { date: "2026-03", solved_problem: 0 },
      { date: "2026-04", solved_problem: 0 },
      { date: "2026-05", solved_problem: 0 },
      { date: "2026-06", solved_problem: 0 },
      { date: "2026-07", solved_problem: 0 },
      { date: "2026-08", solved_problem: 2 },
      { date: "2026-09", solved_problem: 2 },
    ],
    message: "월별 문제 해결 통계 조회 성공",
    summary: { total_months: 12, total_problems: 4, period: "최근 1년" },
  });

  const total = await userRequest(context, "/api/statistics/total-problems");
  expect(total.status).toBe(200);
  expect(await total.json()).toEqual({
    success: true,
    data: { total_problems: 5 },
    message: "전체 문제 수 조회 성공",
  });

  await runUserMutationCases(context);
}
