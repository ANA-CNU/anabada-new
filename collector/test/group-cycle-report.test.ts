import assert from "node:assert/strict";
import test from "node:test";
import type {
  CycleFlowStep,
  FlowTrace,
  GroupCycleFlowStep,
} from "../src/application/flow-log.js";
import {
  GroupCycleFailure,
  type GroupCycleResult,
} from "../src/application/group-cycle.js";
import { GroupCycleReportMapper } from "../src/application/group-cycle-report.js";
import { JungolError } from "../src/jungol/errors.js";
import { LeaseError } from "../src/mysql/lease.js";

const trace: FlowTrace<GroupCycleFlowStep> = {
  events: [
    {
      sequence: 1,
      elapsedMs: 1,
      step: "group_scan",
      outcome: "failed",
    },
  ],
  droppedEventCount: 0,
};

test("Given a pending group window When mapping its result Then it remains a normal collector success with accepted AC counts", () => {
  const result: GroupCycleResult = {
    status: "success_pending",
    memberCount: 2,
    initializationFailureCount: 0,
    initializationFailures: [],
    settlementFailureCount: 0,
    scan: {
      phase: "collecting",
      status: "pending",
      acceptedCount: 7,
      scannedPageCount: 10,
    },
    settlement: {
      settledUserCount: 0,
      failedUserCount: 0,
      failures: [],
      insertedAttemptCount: 0,
      duplicateAttemptCount: 0,
      inboxEmpty: false,
    },
    finalized: false,
    trace: undefined,
  };

  const report = new GroupCycleReportMapper().result(result);

  assert.equal(report.status, "success");
  assert.equal(report.acceptedAttemptCount, 7);
  assert.equal(report.scannedAttemptCount, 7);
  assert.equal(report.syncUserCount, 0);
});

test("Given an auth circuit GroupCycleFailure When mapping the failure Then the report preserves the safe circuit status and group trace", () => {
  const report = new GroupCycleReportMapper().failure(
    new GroupCycleFailure(new JungolError("auth_required"), trace),
  );

  assert.equal(report.status, "auth_required");
  assert.equal(report.errorCode, "auth_required");
  assert.equal(report.commonFailures[0]?.trace?.events[0]?.step, "group_scan");
});

test("Given an outer lease failure When mapping the failure Then the report retains its cycle trace", () => {
  const outerTrace: FlowTrace<CycleFlowStep> = {
    events: [
      {
        sequence: 1,
        elapsedMs: 1,
        step: "lease",
        outcome: "failed",
      },
    ],
    droppedEventCount: 0,
  };

  const report = new GroupCycleReportMapper().failure(
    new LeaseError(),
    outerTrace,
  );

  assert.equal(report.status, "failed");
  assert.equal(report.errorCode, "lease_acquisition_failed");
  assert.equal(report.commonFailures[0]?.trace?.events[0]?.step, "lease");
});
