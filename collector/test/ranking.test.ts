import assert from "node:assert/strict";
import test from "node:test";
import { WeightedRankingPolicy } from "../src/scoring/ranking.js";

test("ranking preserves deterministic weighted lottery and unique membership", () => {
  const users = [
    { userId: 1, score: 2 },
    { userId: 2, score: 10 },
    { userId: 3, score: 4 },
  ];
  const ranking = new WeightedRankingPolicy();
  assert.deepEqual(ranking.rank(users, "anabada-202609-16"), [2, 1, 3]);
  assert.deepEqual(ranking.rank([], "anabada-202609-0"), []);
});
