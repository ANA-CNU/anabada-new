import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUpdateTime } from "../src/home/update-time.ts";

const now = Date.parse("2026-09-16T08:31:43.000Z");

function boardResponse(createdAt) {
  return { success: true, data: { created_at: createdAt } };
}

test("last update formats the elapsed time and exact Seoul time from the server clock", () => {
  const createdAt = "2026-09-16T08:21:43.000Z";
  assert.deepEqual(parseUpdateTime(boardResponse(createdAt), now), {
    kind: "ready",
    exact: "2026년 9월 16일 17:21:43 KST",
    relative: "10분 전",
    dateTime: createdAt,
  });
  assert.equal(parseUpdateTime(boardResponse(new Date(now - 59_000).toISOString()), now).relative, "방금 전");
  assert.equal(parseUpdateTime(boardResponse(new Date(now - 3_600_000).toISOString()), now).relative, "1시간 전");
  assert.equal(parseUpdateTime(boardResponse(new Date(now - 86_400_000).toISOString()), now).relative, "1일 전");
});

test("last update distinguishes a missing board from an invalid response", () => {
  for (const response of [{ success: true, data: null }, { success: true }]) {
    assert.deepEqual(parseUpdateTime(response, now), { kind: "empty" });
  }
  for (const response of [boardResponse("not-a-timestamp"), boardResponse(null), { success: false }, null]) {
    assert.deepEqual(parseUpdateTime(response, now), { kind: "error" });
  }
});
