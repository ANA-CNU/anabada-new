import { expect } from "bun:test";
import { sqlOperations } from "../../../src/infrastructure/mysql/database-session.js";
import type { MysqlTestContext } from "../context.js";
import { runRankingScoreCases } from "./ranking-score-cases.js";
import { expectRankingJson } from "./ranking-test-support.js";

export async function runRankingCases(
  context: MysqlTestContext,
): Promise<void> {
  await context.seed();

  // Given current-month solves with a repeated acceptance
  // When the solved ranking feeds are requested
  // Then only unique accepted solves and canonical user fields are exposed.
  await expectRankingJson(context, "/api/ranking/solved", {
    success: true,
    data: [
      {
        display_name: "alpha",
        jungol_name: "alpha",
        korean_name: "가나다",
        tier: 12,
        solved: 1,
      },
    ],
    message: "해결한 문제 랭킹 조회 성공",
  });
  await expectRankingJson(context, "/api/ranking/monthly-solved", {
    success: true,
    data: [
      {
        display_name: "alpha",
        jungol_name: "alpha",
        korean_name: "가나다",
        tier: 12,
        solved: 1,
        total_solved: 3,
      },
    ],
    message: "해결한 문제 랭킹 조회 성공",
  });
  await expectRankingJson(context, "/api/ranking/bias", {
    success: true,
    data: [
      {
        display_name: "beta",
        jungol_name: "beta",
        korean_name: null,
        tier: 8,
        bias: 1,
      },
    ],
    message: "가중치 랭킹 조회 성공",
  });

  // Given consecutive current and previous boards
  // When board ranking routes are requested
  // Then rank changes are measured against the prior board.
  await expectRankingJson(context, "/api/v2/ranking/bias", {
    success: true,
    data: [
      {
        display_name: "alpha",
        jungol_name: "alpha",
        korean_name: "가나다",
        tier: 12,
        rank: 1,
        delta: 1,
        total_problem: 3,
        bias: -1,
        monthly_problem: 1,
      },
      {
        display_name: "beta",
        jungol_name: "beta",
        korean_name: null,
        tier: 8,
        rank: 2,
        delta: -1,
        total_problem: 2,
        bias: 1,
        monthly_problem: 0,
      },
    ],
    message: "가중치 랭킹(v2) 조회 성공",
  });
  await expectRankingJson(context, "/api/board/latest", {
    success: true,
    data: [
      {
        display_name: "alpha",
        jungol_name: "alpha",
        korean_name: "가나다",
        tier: 12,
        bias: -1,
        rank: 1,
      },
      {
        display_name: "beta",
        jungol_name: "beta",
        korean_name: null,
        tier: 8,
        bias: 1,
        rank: 2,
      },
    ],
    message: "최신 랭킹 보드 조회 성공",
  });
  await expectRankingJson(context, "/api/board/recently-date", {
    success: true,
    data: { created_at: "2026-09-08T00:00:00.000Z" },
    message: "최신 랭킹 보드 생성일시 조회 성공",
  });
  await expectRankingJson(context, "/api/board/top-gainers", {
    success: true,
    data: [
      {
        user_id: 1,
        display_name: "alpha",
        jungol_name: "alpha",
        korean_name: "가나다",
        tier: 12,
        rank: 1,
        delta: 1,
      },
      {
        user_id: 2,
        display_name: "beta",
        jungol_name: "beta",
        korean_name: null,
        tier: 8,
        rank: 2,
        delta: -1,
      },
    ],
  });
  await expectRankingJson(context, "/api/board/user/1/rank-history", [
    { board_id: 501, created_at: "2026-08-31T00:00:00.000Z", rank: 2 },
    { board_id: 502, created_at: "2026-09-08T00:00:00.000Z", rank: 1 },
  ]);
  await expectRankingJson(context, "/api/ranking/selected-month-board", {
    success: true,
    data: [
      {
        display_name: "alpha",
        jungol_name: "alpha",
        korean_name: "가나다",
        tier: 12,
        rank: 1,
        last_month_solved: 0,
        last_month_score: 0,
      },
      {
        display_name: "beta",
        jungol_name: "beta",
        korean_name: null,
        tier: 8,
        rank: 2,
        last_month_solved: 1,
        last_month_score: 1,
      },
    ],
    message: "지난달 랭킹 보드 조회 성공",
  });

  await runRankingScoreCases(context);

  // Given no persisted ranking boards
  // When board readers run through the application
  // Then list feeds are empty and the optional latest date is omitted.
  await context.rawPool.execute("DELETE FROM ranked_users");
  await context.rawPool.execute("DELETE FROM ranking_boards");
  await expectRankingJson(context, "/api/board/latest", {
    success: true,
    data: [],
    message: "최신 랭킹 보드 조회 성공",
  });
  await expectRankingJson(context, "/api/board/recently-date", {
    success: true,
    message: "최신 랭킹 보드 생성일시 조회 성공",
  });
  await expectRankingJson(context, "/api/board/top-gainers", {
    success: true,
    data: [],
  });
  await context.seed();

  const rankingOperations = Object.values(sqlOperations).filter(({ id }) =>
    id.startsWith("ranking."),
  );
  expect(
    rankingOperations.every(({ id }) => context.observedOperationIds.has(id)),
  ).toBe(true);
}
