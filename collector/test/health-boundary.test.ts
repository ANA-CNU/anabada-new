import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CYCLE_UNHEALTHY_AFTER_MS } from "../src/cycle-lifecycle-reporter.js";
import { CollectorHealthStore } from "../src/health.js";

test("Given a running cycle just below or at twenty minutes When checking health Then only the former is healthy", async () => {
  let now = 2_000_000;
  const health = new CollectorHealthStore(() => now);
  const directory = await mkdtemp(join(tmpdir(), "collector-health-boundary-"));
  try {
    await health.write(directory, {
      status: "running",
      lastStartedAt: now - CYCLE_UNHEALTHY_AFTER_MS + 1,
      lastCompletedAt: null,
      degraded: false,
    });
    assert.equal(await health.isHealthy(directory), true);
    now += 1;
    assert.equal(await health.isHealthy(directory), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Given a long cycle that completes When health becomes idle Then recovery is healthy", async () => {
  const now = 2_000_000;
  const health = new CollectorHealthStore(() => now);
  const directory = await mkdtemp(join(tmpdir(), "collector-health-recovery-"));
  try {
    await health.write(directory, {
      status: "idle",
      lastStartedAt: now - CYCLE_UNHEALTHY_AFTER_MS,
      lastCompletedAt: now,
      degraded: false,
    });
    assert.equal(await health.isHealthy(directory), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
