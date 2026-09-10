import assert from "node:assert/strict";
import test from "node:test";
import { CollectorService } from "../src/application/service.js";

test("Given a normal start before a boundary When scheduling Then it waits for the next clock-aligned slot", async () => {
  const events: string[] = [];
  const service = new CollectorService({
    cycle: async () => {
      events.push("cycle");
      service.stop();
    },
    close: async () => {
      events.push("close");
    },
    delay: async (milliseconds) => {
      events.push(`delay:${milliseconds}`);
    },
    intervalMs: 600_000,
    now: () => 601_234,
    runOnce: false,
  });

  await service.run();

  assert.deepEqual(events, ["delay:598766", "cycle", "close"]);
});

test("Given an overrun cycle When scheduling Then it skips missed slots and waits for the next future boundary", async () => {
  let now = 601_234;
  const events: string[] = [];
  let delayCount = 0;
  const service = new CollectorService({
    cycle: async () => {
      events.push("cycle");
      now = 1_801_234;
    },
    close: async () => {
      events.push("close");
    },
    delay: async (milliseconds) => {
      events.push(`delay:${milliseconds}`);
      delayCount += 1;
      if (delayCount === 2) service.stop();
    },
    intervalMs: 600_000,
    now: () => now,
    runOnce: false,
  });

  await service.run();

  assert.deepEqual(events, ["delay:598766", "cycle", "delay:598766", "close"]);
});

test("Given run-once When scheduling Then it runs immediately without a boundary delay", async () => {
  const events: string[] = [];
  const service = new CollectorService({
    cycle: async () => {
      events.push("cycle");
    },
    close: async () => {
      events.push("close");
    },
    delay: async () => assert.fail("unexpected delay"),
    intervalMs: 600_000,
    now: () => 601_234,
    runOnce: true,
  });

  await service.run();

  assert.deepEqual(events, ["cycle", "close"]);
});

test("Given an open circuit at an exact boundary When scheduling Then it runs once and performs no future cycle", async () => {
  const events: string[] = [];
  const service = new CollectorService({
    cycle: async () => {
      events.push("cycle");
      return "circuit_open";
    },
    close: async () => {
      events.push("close");
    },
    delay: async (milliseconds) => {
      events.push(milliseconds === 0 ? "boundary" : "wait");
      if (milliseconds > 0) service.stop();
    },
    intervalMs: 600_000,
    now: () => 0,
    runOnce: false,
  });

  await service.run();

  assert.deepEqual(events, ["boundary", "cycle", "wait", "close"]);
});

test("Given a zero-duration cycle at a boundary When scheduling Then it does not run twice in that slot", async () => {
  const events: string[] = [];
  let waits = 0;
  const service = new CollectorService({
    cycle: async () => {
      events.push("cycle");
    },
    close: async () => {
      events.push("close");
    },
    delay: async (milliseconds) => {
      events.push(`delay:${milliseconds}`);
      waits += 1;
      if (waits === 2) service.stop();
    },
    intervalMs: 600_000,
    now: () => 1_200_000,
    runOnce: false,
  });

  await service.run();

  assert.deepEqual(events, ["delay:0", "cycle", "delay:600000", "close"]);
});

test("Given shutdown before the first boundary When scheduling Then it never invokes a cycle", async () => {
  const events: string[] = [];
  const service = new CollectorService({
    cycle: async () => assert.fail("unexpected cycle"),
    close: async () => {
      events.push("close");
    },
    delay: async () => {
      service.stop();
    },
    intervalMs: 600_000,
    now: () => 1,
    runOnce: false,
  });

  await service.run();

  assert.deepEqual(events, ["close"]);
});
