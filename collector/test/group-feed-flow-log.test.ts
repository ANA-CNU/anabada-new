import assert from "node:assert/strict";
import test from "node:test";
import { GroupFeedFlowLog } from "../src/application/group-feed-flow-log.js";
import { JungolError } from "../src/jungol/errors.js";

test("Given a DOM row-growth timeout When the feed flow fails Then it retains the first typed failure and bounded trail", async () => {
  // Given
  const clock = (() => {
    let value = 0;
    return () => ++value;
  })();
  const flow = new GroupFeedFlowLog(clock);

  // When
  await flow.runStep("rows_parse", async () => {});
  await assert.rejects(
    flow.runStep("rows_growth_wait", async () => {
      throw new JungolError("group_feed_rows_timeout", {
        stage: "group_feed_rows_growth_wait",
        reason: "timeout",
        timeoutMs: 30_000,
        pageNumber: 3,
        previousRowCount: 100,
        currentRowCount: 100,
        loadingVisible: true,
      });
    }),
  );

  // Then
  const trace = flow.failureSnapshot();
  assert.equal(trace?.primaryFailure?.step, "rows_growth_wait");
  assert.equal(trace?.primaryFailure?.errorKind, undefined);
  assert.equal(trace?.events.at(-1)?.outcome, "failed");
});

test("Given an internal exception after a DOM failure When recording the trace Then the initial DOM failure is not overwritten", async () => {
  // Given
  const flow = new GroupFeedFlowLog(() => 1);

  // When
  await assert.rejects(
    flow.runStep("filter_check", async () => {
      throw new JungolError("group_feed_filter_invalid", {
        stage: "group_feed_filter_check",
        reason: "mismatch",
      });
    }),
  );
  await assert.rejects(
    flow.runStep("cursor_check", async () => {
      throw new TypeError("not safe for webhook");
    }),
  );

  // Then
  assert.equal(flow.failureSnapshot()?.primaryFailure?.step, "filter_check");
});
