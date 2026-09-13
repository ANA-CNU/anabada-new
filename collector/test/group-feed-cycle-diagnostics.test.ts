import assert from "node:assert/strict";
import test from "node:test";
import { CycleTrace } from "../src/application/cycle-diagnostics.js";
import { JungolError } from "../src/jungol/errors.js";

test("Given a typed DOM failure with a source frame When CycleTrace records it Then the first failure keeps only safe mapped location fields", async () => {
  // Given
  const trace = new CycleTrace("cycle-1", () => 1);

  // When
  await assert.rejects(
    trace.run("rows_growth_wait", {}, async () => {
      throw new JungolError("group_feed_rows_timeout", {
        stage: "group_feed_rows_growth_wait",
        reason: "timeout",
        timeoutMs: 30_000,
        location: {
          method: "GroupFeedCollector.loadNextPage",
          source: "collector/src/jungol/group-feed.ts",
          line: 211,
        },
      });
    }),
  );

  // Then
  assert.deepEqual(trace.snapshot().firstFailure?.context, {
    errorKind: "JungolError",
    timeoutMs: 30_000,
    source: "collector/src/jungol/group-feed.ts",
    sourceLine: 211,
    sourceMethod: "GroupFeedCollector.loadNextPage",
  });
});
