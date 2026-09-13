import assert from "node:assert/strict";
import test from "node:test";
import { CycleTrace } from "../src/application/cycle-diagnostics.js";

test("Given more than one hundred twenty-eight events When a cycle fails Then its first failure and transaction state remain available", async () => {
  // Given
  let now = 0;
  const trace = new CycleTrace("cycle-safe-id", () => ++now);

  // When
  await assert.rejects(
    trace.run("navigation", {}, async () => {
      throw new TypeError("secret");
    }),
  );
  for (let index = 0; index < 80; index += 1)
    await trace.run("responsewait", { count: index }, async () => {});
  trace.transaction("rollback_failed");

  // Then
  const snapshot = trace.snapshot();
  assert.equal(snapshot.cycleId, "cycle-safe-id");
  assert.equal(snapshot.events.length, 128);
  assert.equal(snapshot.droppedEventCount, 34);
  assert.equal(snapshot.firstFailure?.stage, "navigation");
  assert.equal(snapshot.transactionStatus, "rollback_failed");
  assert.ok(snapshot.durationMs > 0);
});

test("Given unsafe trace scalars When recording diagnostics Then controls, code ticks, and mentions are normalized", () => {
  const trace = new CycleTrace("cycle-safe-id");

  trace.stage("header\n@everyone`", {
    code: "status\u0000@here`",
    cursorPresent: true,
    sqlState: "HY000",
    cursor: "opaque-value",
  });

  const event = trace.snapshot().events[0];
  assert.equal(event?.stage, "header  everyone ");
  assert.deepEqual(event?.context, {
    code: "status  here ",
    cursorPresent: true,
    sqlState: "HY000",
  });
});

test("Given an admitted queue wait When it remains open Then its stage is visible until cancellation finishes it", () => {
  const trace = new CycleTrace("queue-cycle");
  const span = trace.begin("request_queue_wait", { pageNumber: 3 });

  assert.equal(trace.currentStage(), "request_queue_wait");
  trace.finish(span, "failed", { code: "cancelled" });
  assert.equal(trace.currentStage(), undefined);
  assert.equal(trace.snapshot().firstFailure?.stage, "request_queue_wait");
});

test("Given nested traced operations When the inner operation finishes Then currentStage returns to its outer operation", async () => {
  const trace = new CycleTrace("nested-cycle");

  await trace.run("outer", {}, async () => {
    assert.equal(trace.currentStage(), "outer");
    await trace.run("inner", {}, async () => {
      assert.equal(trace.currentStage(), "inner");
    });
    assert.equal(trace.currentStage(), "outer");
  });

  assert.equal(trace.currentStage(), undefined);
});

test("Given a safe SQL driver-shaped failure When a traced step fails Then its immutable first failure retains only SQL diagnostics", async () => {
  const trace = new CycleTrace("sql-cycle");
  const error = Object.assign(new Error("private SQL"), {
    errno: 1213,
    sqlState: "40001",
  });
  error.name = "PersistenceError";
  await assert.rejects(
    trace.run("db_commit", {}, async () => {
      throw error;
    }),
  );
  assert.deepEqual(trace.snapshot().firstFailure?.context, {
    errno: 1213,
    sqlState: "40001",
    errorKind: "PersistenceError",
  });
});
