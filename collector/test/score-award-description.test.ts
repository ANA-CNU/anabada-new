import assert from "node:assert/strict";
import test from "node:test";
import { ScoreAward } from "../src/domain/sync.js";

test("Given daily and event awards When reading their descriptions Then each names its own scoring source", () => {
  const dailyAward = new ScoreAward(
    "daily",
    "daily:17:2026-09-10",
    17,
    91,
    1234,
    null,
    "2026-09-10",
    new Date("2026-09-10T00:00:00Z"),
  );
  const eventAward = new ScoreAward(
    "event",
    "event:42:17:1234",
    17,
    91,
    1234,
    42,
    "2026-09-10",
    new Date("2026-09-10T00:00:00Z"),
  );

  assert.equal(dailyAward.description, "#1234를 해결하여, 일일 점수 획득");
  assert.equal(
    eventAward.description,
    "이벤트 ID #event42 문제를 풀어 점수 획득",
  );
  assert.equal(dailyAward.awardKey, "daily:17:2026-09-10");
  assert.equal(eventAward.awardKey, "event:42:17:1234");
});
