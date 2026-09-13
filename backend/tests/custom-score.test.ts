import { expect, test } from "bun:test";
import { scoreHistoryDtoSchema } from "../src/infrastructure/mysql/repositories/contracts.js";

const row = {
  id: 1,
  user_id: 1,
  display_name: "fixture",
  desc: "관리자 점수",
  bias: -3,
  score_day: null,
  event_id: null,
  problem_id: null,
  created_at: new Date("2026-09-13T00:00:00Z"),
};

test("Given an administrator score When parsing its DTO Then custom is accepted and manual is rejected", () => {
  expect(
    scoreHistoryDtoSchema.parse({ ...row, rule_type: "custom" }).rule_type,
  ).toBe("custom");
  expect(
    scoreHistoryDtoSchema.safeParse({ ...row, rule_type: "manual" }).success,
  ).toBe(false);
});

test("Given an automatic score When parsing its DTO Then daily and event remain distinct", () => {
  for (const rule_type of ["daily", "event"] as const) {
    expect(scoreHistoryDtoSchema.parse({ ...row, rule_type }).rule_type).toBe(
      rule_type,
    );
  }
});
