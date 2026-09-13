import assert from "node:assert/strict";
import test from "node:test";
import { SubmissionTimestampParser } from "../src/jungol/submission-timestamp.js";

const parser = new SubmissionTimestampParser();

for (const [raw, expected] of [
  ["2026. 9. 13. 오전 12:00:00", "2026-09-12T15:00:00.000Z"],
  ["2026. 9. 13. 오후 12:00:00", "2026-09-13T03:00:00.000Z"],
  ["2026. 9. 13. 오전 1:02:03", "2026-09-12T16:02:03.000Z"],
  ["2026. 9. 13. 오후 7:37:16", "2026-09-13T10:37:16.000Z"],
] as const)
  test(`Korean absolute tooltip ${raw} normalizes to its KST UTC instant`, () => {
    assert.equal(parser.parse(raw).toISOString(), expected);
  });

test("relative or malformed tooltip text is rejected instead of guessed", () => {
  assert.throws(
    () => parser.parse("3분 전"),
    /group_feed_timestamp_parse_failed/,
  );
});
