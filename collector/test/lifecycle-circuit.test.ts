import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { CycleAdapters } from "../src/application/cycle-types.js";
import { SyncCycleExecutor } from "../src/application/execute-cycle.js";
import { CollectorService } from "../src/application/service.js";
import { JungolError } from "../src/jungol/errors.js";

for (const code of [
  "login_failed",
  "auth_required",
  "manual_recovery_required",
] as const) {
  test(`login ${code} returns a sanitized in-memory status`, async () => {
    const status = code === "manual_recovery_required" ? code : "auth_required";
    const adapters: CycleAdapters = {
      lease: async () => ({ release: async () => {} }),
      login: async () => {
        throw new JungolError(code);
      },
      rank: async () => assert.fail("unexpected rank"),
      stored: async () => new Map(),
      browser: async () => assert.fail("unexpected browser"),
      persist: async () => assert.fail("unexpected persist"),
      initialize: async () => assert.fail("unexpected initialization"),
      refreshMetadata: async () => assert.fail("unexpected metadata"),
      project: async () => assert.fail("unexpected projection"),
    };
    const result = await new SyncCycleExecutor(adapters, {
      concurrency: 1,
      maxPages: 1,
    }).run(new AbortController().signal);
    assert.equal(result.status, status);
  });
}

test("run once exits a circuit without waiting for operator", async () => {
  let closed = false;
  const service = new CollectorService({
    cycle: async () => "circuit_open",
    close: async () => {
      closed = true;
    },
    delay: async () => assert.fail("unexpected repeat delay"),
    intervalMs: 1,
    runOnce: true,
  });
  await service.run();
  assert.equal(closed, true);
});

test(
  "open circuit keeps process alive degraded without another cycle until SIGTERM",
  { timeout: 5000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "collector-circuit-"));
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
    import {CollectorService} from './src/application/service.ts';
    import {CollectorHealthStore} from './src/health.ts';
    const health=new CollectorHealthStore();
    let calls=0;
    const service=new CollectorService({intervalMs:1,runOnce:false,
      cycle:async()=>{calls++;await health.write(process.env.CIRCUIT_DIR,{status:'failed',lastStartedAt:Date.now(),lastCompletedAt:Date.now(),degraded:true});process.send('opened');return 'circuit_open';},
      delay:async()=>{throw new Error('unexpected repeat delay');},
      close:async()=>{process.stdout.write('closed\\n');},
    });
    process.on('SIGTERM',()=>service.stop());
    process.on('message',async()=>{process.send({calls,healthy:await health.isHealthy(process.env.CIRCUIT_DIR)});});
    await service.run();process.disconnect();
  `,
      ],
      {
        cwd: new URL("..", import.meta.url),
        env: { ...process.env, CIRCUIT_DIR: directory },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    assert.ok(child.stdout);
    assert.ok(child.stderr);
    let output = "";
    let errors = "";
    let observed = false;
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      errors += chunk;
    });
    child.on("message", (message: unknown) => {
      if (message === "opened") child.send("probe");
      else {
        assert.deepEqual(message, { calls: 1, healthy: false });
        observed = true;
        child.kill("SIGTERM");
      }
    });
    try {
      const exit = await new Promise<number | null>((resolve, reject) => {
        child.once("close", resolve);
        child.once("error", reject);
      });
      assert.equal(exit, 0, errors);
      assert.equal(observed, true);
      assert.equal(output, "closed\n");
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await rm(directory, { recursive: true, force: true });
    }
  },
);
