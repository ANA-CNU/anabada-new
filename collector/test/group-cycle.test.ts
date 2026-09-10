import assert from "node:assert/strict";
import test from "node:test";
import {
  type GroupCycleAdapters,
  GroupCycleExecutor,
  GroupCycleFailure,
} from "../src/application/group-cycle.js";
import { rankMemberSchema } from "../src/domain/sync.js";

test("Given initialized group members When a complete feed window settles Then cache repair precedes projection in a separate final phase", async () => {
  const events: string[] = [];
  const adapters: GroupCycleAdapters = {
    phase: async () => "collecting",
    members: async () => [
      rankMemberSchema.parse({
        accountId: "1",
        jungolName: "member",
        solvedCount: 0,
        wrongCount: 0,
        acRating: 0,
        tier: 0,
      }),
    ],
    checkpointInitialHead: async () => {
      events.push("checkpoint");
    },
    initializeMembers: async () => {
      events.push("initialize");
      return [];
    },
    advanceWindow: async (_signal, maxPages) => {
      events.push(`scan:${maxPages}`);
      return {
        phase: "collecting",
        status: "complete",
        acceptedCount: 2,
        scannedPageCount: 1,
      };
    },
    settle: async () => {
      events.push("settle");
      return {
        settledUserCount: 1,
        failedUserCount: 0,
        failures: [],
        insertedAttemptCount: 2,
        duplicateAttemptCount: 0,
        inboxEmpty: true,
      };
    },
    finalize: async () => {
      events.push("finalize");
      return "finalized";
    },
    rebuildMonthlyCache: async () => {
      events.push("cache");
    },
    project: async () => {
      events.push("project");
    },
  };

  const result = await new GroupCycleExecutor(adapters).run(
    new AbortController().signal,
  );

  assert.deepEqual(events, [
    "checkpoint",
    "initialize",
    "scan:10",
    "settle",
    "finalize",
    "cache",
    "project",
  ]);
  assert.equal(result.settlement.insertedAttemptCount, 2);
  assert.equal(result.finalized, true);
  assert.equal(result.status, "success");
});

test("Given a pending ten-page window When the cycle ends Then settlement and checkpoint finalization wait for completion", async () => {
  const events: string[] = [];
  const adapters: GroupCycleAdapters = {
    phase: async () => "collecting",
    members: async () => [],
    checkpointInitialHead: async () => {
      events.push("checkpoint");
    },
    initializeMembers: async () => [],
    advanceWindow: async () => {
      events.push("scan");
      return {
        phase: "collecting",
        status: "pending",
        acceptedCount: 50,
        scannedPageCount: 10,
      };
    },
    settle: async () => assert.fail("pending feed must not settle"),
    finalize: async () => assert.fail("pending feed must not finalize"),
    rebuildMonthlyCache: async () => {
      events.push("cache");
    },
    project: async () => {
      events.push("project");
    },
  };

  const result = await new GroupCycleExecutor(adapters).run(
    new AbortController().signal,
  );

  assert.deepEqual(events, ["checkpoint", "scan", "cache", "project"]);
  assert.equal(result.finalized, false);
  assert.equal(result.settlement.settledUserCount, 0);
  assert.equal(result.status, "success_pending");
});

test("Given a persisted settling phase When resuming the cycle Then initialization retries before settlement without a feed re-scan", async () => {
  const events: string[] = [];
  const adapters: GroupCycleAdapters = {
    phase: async () => "settling",
    members: async () => [],
    checkpointInitialHead: async () => {
      events.push("checkpoint");
    },
    initializeMembers: async () => {
      events.push("initialize");
      return [];
    },
    advanceWindow: async () => assert.fail("settling cycle must not scan"),
    settle: async () => {
      events.push("settle");
      return {
        settledUserCount: 1,
        failedUserCount: 0,
        failures: [],
        insertedAttemptCount: 1,
        duplicateAttemptCount: 0,
        inboxEmpty: false,
      };
    },
    finalize: async () => assert.fail("nonempty inbox must stay pending"),
    rebuildMonthlyCache: async () => {},
    project: async () => {},
  };

  const result = await new GroupCycleExecutor(adapters).run(
    new AbortController().signal,
  );

  assert.deepEqual(events, ["checkpoint", "initialize", "settle"]);
  assert.equal(result.status, "success_pending");
  assert.equal(result.finalized, false);
});

test("Given a scan adapter failure When running the cycle Then a typed failure retains the group scan trace", async () => {
  const adapters: GroupCycleAdapters = {
    phase: async () => "collecting",
    members: async () => [],
    checkpointInitialHead: async () => {},
    initializeMembers: async () => [],
    advanceWindow: async () => {
      throw new Error("scan failed");
    },
    settle: async () => assert.fail("failed scan must not settle"),
    finalize: async () => assert.fail("failed scan must not finalize"),
    rebuildMonthlyCache: async () =>
      assert.fail("failed scan must not repair cache"),
    project: async () => assert.fail("failed scan must not project"),
  };

  await assert.rejects(
    () => new GroupCycleExecutor(adapters).run(new AbortController().signal),
    (error: unknown) =>
      error instanceof GroupCycleFailure &&
      error.trace.primaryFailure?.step === "group_scan",
  );
});

test("Given one failed account settlement When other account settlements commit Then the cycle reports a partial result with its failure trace", async () => {
  const adapters: GroupCycleAdapters = {
    phase: async () => "settling",
    members: async () => [],
    checkpointInitialHead: async () => {},
    initializeMembers: async () => [],
    advanceWindow: async () => assert.fail("settling cycle must not scan"),
    settle: async () => ({
      settledUserCount: 1,
      failedUserCount: 1,
      failures: [
        { accountId: "2", code: "account_conflict", trace: undefined },
      ],
      insertedAttemptCount: 1,
      duplicateAttemptCount: 0,
      inboxEmpty: false,
    }),
    finalize: async () => assert.fail("failed settlement keeps inbox pending"),
    rebuildMonthlyCache: async () => {},
    project: async () => {},
  };

  const result = await new GroupCycleExecutor(adapters).run(
    new AbortController().signal,
  );

  assert.equal(result.status, "partial");
  assert.equal(result.settlementFailureCount, 1);
  assert.equal(result.settlement.failures[0]?.code, "account_conflict");
});

test("Given a failed baseline and pending inbox When the next cycle is settling Then initialization retries before final settlement without feed re-scan", async () => {
  let cycle = 1;
  let initialized = false;
  const feedAdvances: number[] = [];
  const adapters: GroupCycleAdapters = {
    phase: async () => (cycle === 1 ? "collecting" : "settling"),
    members: async () => [
      rankMemberSchema.parse({
        accountId: "1",
        jungolName: "member",
        solvedCount: 0,
        wrongCount: 0,
        acRating: 0,
        tier: 0,
      }),
    ],
    checkpointInitialHead: async () => {},
    initializeMembers: async () => {
      if (cycle === 1) return [{ accountId: "1", code: "profile_unavailable" }];
      initialized = true;
      return [];
    },
    advanceWindow: async () => {
      feedAdvances.push(cycle);
      return {
        phase: "collecting",
        status: "complete",
        acceptedCount: 1,
        scannedPageCount: 1,
      };
    },
    settle: async () => {
      if (cycle === 1)
        return {
          settledUserCount: 0,
          failedUserCount: 0,
          failures: [],
          insertedAttemptCount: 0,
          duplicateAttemptCount: 0,
          inboxEmpty: false,
        };
      assert.equal(initialized, true);
      return {
        settledUserCount: 1,
        failedUserCount: 0,
        failures: [],
        insertedAttemptCount: 1,
        duplicateAttemptCount: 0,
        inboxEmpty: true,
      };
    },
    finalize: async () => "finalized",
    rebuildMonthlyCache: async () => {},
    project: async () => {},
  };

  const first = await new GroupCycleExecutor(adapters).run(
    new AbortController().signal,
  );
  cycle = 2;
  const second = await new GroupCycleExecutor(adapters).run(
    new AbortController().signal,
  );

  assert.equal(first.status, "partial");
  assert.equal(first.initializationFailures[0]?.code, "profile_unavailable");
  assert.deepEqual(feedAdvances, [1]);
  assert.equal(second.status, "success");
});

test("Given an already cancelled signal When starting a group cycle Then no adapter is called", async () => {
  const controller = new AbortController();
  controller.abort();
  const adapters: GroupCycleAdapters = {
    phase: async () => assert.fail("cancelled cycle must not read phase"),
    members: async () => assert.fail("cancelled cycle must not read members"),
    checkpointInitialHead: async () =>
      assert.fail("cancelled cycle must not checkpoint"),
    initializeMembers: async () =>
      assert.fail("cancelled cycle must not initialize"),
    advanceWindow: async () => assert.fail("cancelled cycle must not scan"),
    settle: async () => assert.fail("cancelled cycle must not settle"),
    finalize: async () => assert.fail("cancelled cycle must not finalize"),
    rebuildMonthlyCache: async () =>
      assert.fail("cancelled cycle must not repair cache"),
    project: async () => assert.fail("cancelled cycle must not project"),
  };

  await assert.rejects(
    () => new GroupCycleExecutor(adapters).run(controller.signal),
    { name: "AbortError" },
  );
});
