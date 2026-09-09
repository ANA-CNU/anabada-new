import assert from "node:assert/strict";
import test from "node:test";
import { AccountFlowLog } from "../src/application/flow-log.js";

test("Given concurrent account flows When one fails Then each immutable trace keeps only its own ordered safe events", async () => {
  const clock = (() => {
    let now = 0;
    return () => ++now;
  })();
  const first = new AccountFlowLog(clock);
  const second = new AccountFlowLog(clock);

  await Promise.all([
    first.runStep("initial_cursor", async () => {}),
    second.runStep("incremental_collect", async () => {}),
    assert.rejects(
      first.runStep("initial_summary", async () => {
        await Promise.resolve();
        throw new TypeError("private-message");
      }),
    ),
  ]);

  const firstTrace = first.failureSnapshot();
  const secondTrace = second.failureSnapshot();
  assert.equal(firstTrace?.events.at(-1)?.step, "initial_summary");
  assert.equal(firstTrace?.events.at(-1)?.outcome, "failed");
  assert.equal(firstTrace?.events.at(-1)?.errorKind, "type_error");
  assert.equal(
    firstTrace?.events.some((event) => event.elapsedMs < 0),
    false,
  );
  assert.equal(secondTrace, undefined);
});

test("Given more than thirty-two safe events When a flow fails Then it retains the tail and reports dropped count", async () => {
  const trace = new AccountFlowLog(() => 1);
  for (let index = 0; index < 20; index++)
    await trace.runStep("metadata", async () => {});
  await assert.rejects(
    trace.runStep("db_persist", async () => {
      throw new RangeError("private-message");
    }),
  );

  const snapshot = trace.failureSnapshot();
  assert.equal(snapshot?.events.length, 32);
  assert.equal(snapshot?.droppedEventCount, 10);
  assert.equal(snapshot?.events.at(-1)?.errorKind, "range_error");
});

test("Given a recovered retry When it completes Then its trace is disposed without an alert snapshot", async () => {
  const trace = new AccountFlowLog(() => 1);
  await assert.rejects(
    trace.runStep("db_persist", async () => {
      throw new TypeError("private-message");
    }),
  );
  await trace.runStep("rank_refresh", async () => {});
  trace.dispose();

  assert.equal(trace.failureSnapshot(), undefined);
});
