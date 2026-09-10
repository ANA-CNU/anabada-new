import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CollectorService } from "../src/application/service.js";
import { CollectorHealthStore } from "../src/health.js";
import { ErrorCodeSanitizer } from "../src/logger.js";

test(
  "SIGTERM settles the active cycle and closes before process exit",
  { timeout: 5000 },
  async () => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
    import { CollectorService } from "./src/application/service.ts";
    const service = new CollectorService({
      intervalMs: 1, runOnce: false,
      cycle: async (signal) => {
        process.stdout.write("running\\n");
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 10000);
          signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, {once: true});
        });
        process.stdout.write("settled\\n");
      },
      close: async () => { process.stdout.write("closed\\n"); },
    });
    process.on("SIGTERM", () => service.stop());
    await service.run();
  `,
      ],
      {
        cwd: new URL("..", import.meta.url),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    let errors = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      errors += chunk;
    });
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      output += chunk;
      if (output === "running\n") child.kill("SIGTERM");
    });
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      assert.equal(code, 0, errors);
      assert.equal(output, "running\nsettled\nclosed\n");
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  },
);

test("starts immediately and run once closes resources without delay", async () => {
  const events: string[] = [];
  const service = new CollectorService({
    cycle: async () => {
      events.push("cycle");
    },
    close: async () => {
      events.push("close");
    },
    delay: async () => {
      events.push("delay");
    },
    intervalMs: 600000,
    runOnce: true,
  });
  await service.run();
  assert.deepEqual(events, ["cycle", "close"]);
});

test("closes resources when a cycle fails", async () => {
  let closed = false;
  const failure = new Error("failure");
  const service = new CollectorService({
    cycle: async () => {
      throw failure;
    },
    close: async () => {
      closed = true;
    },
    intervalMs: 1,
    runOnce: true,
  });
  await assert.rejects(service.run(), failure);
  assert.equal(closed, true);
});

test("reports healthy only for fresh running or idle health state", async () => {
  const health = new CollectorHealthStore();
  const directory = await mkdtemp(join(tmpdir(), "collector-health-"));
  try {
    await health.write(directory, {
      status: "running",
      lastStartedAt: Date.now(),
      lastCompletedAt: null,
      degraded: false,
    });
    assert.equal(await health.isHealthy(directory), true);
    await health.write(directory, {
      status: "failed",
      lastStartedAt: Date.now(),
      lastCompletedAt: Date.now(),
      degraded: true,
    });
    assert.equal(await health.isHealthy(directory), false);
    await health.write(directory, {
      status: "running",
      lastStartedAt: Date.now() - 1800001,
      lastCompletedAt: null,
      degraded: false,
    });
    assert.equal(await health.isHealthy(directory), false);
    await writeFile(
      join(directory, "collector-health.json"),
      JSON.stringify({ status: "idle", updatedAt: 0 }),
    );
    assert.equal(await health.isHealthy(directory), false);
    await writeFile(join(directory, "collector-health.json"), "invalid");
    assert.equal(await health.isHealthy(directory), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("sanitizes unexpected error messages into a stable code", () => {
  assert.equal(
    new ErrorCodeSanitizer().code(new Error("password=secret")),
    "internal_error",
  );
});

test("waits for the next aligned boundary after settlement and abort prevents another cycle", async () => {
  const events: string[] = [];
  const service = new CollectorService({
    cycle: async () => {
      events.push("cycle");
      await Promise.resolve();
      events.push("settled");
    },
    close: async () => {
      events.push("close");
    },
    delay: async (ms) => {
      if (ms === 0) return;
      events.push(String(ms));
      service.stop();
    },
    intervalMs: 123,
    now: () => 0,
    runOnce: false,
  });
  await service.run();
  assert.deepEqual(events, ["cycle", "settled", "123", "close"]);
});

test("cooperative shutdown waits for in flight cycle before close", async () => {
  const events: string[] = [];
  const service = new CollectorService({
    cycle: async (signal) => {
      service.stop();
      assert.equal(signal.aborted, true);
      events.push("settled");
    },
    close: async () => {
      events.push("close");
    },
    delay: async (ms) => {
      if (ms === 0) return;
      assert.fail("unexpected delay");
    },
    intervalMs: 123,
    now: () => 0,
    runOnce: false,
  });
  await service.run();
  assert.deepEqual(events, ["settled", "close"]);
});
