import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { z } from "zod";

for (const status of ["auth_required", "manual_recovery_required"]) {
  for (const runOnce of [true, false]) {
    test(
      `main ${status} circuit ${runOnce ? "exits once" : "waits degraded for shutdown"}`,
      { timeout: 5000 },
      async () => {
        const directory = await mkdtemp(
          join(tmpdir(), "collector-main-circuit-"),
        );
        const child = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            "--input-type=module",
            "-e",
            `
        import {CollectorRuntime} from './src/main.ts';
        import {CollectorConfigLoader} from './src/config.ts';
        import {CollectorHealthStore} from './src/health.ts';
        import {readFile} from 'node:fs/promises';
        let calls=0;
        const health=new CollectorHealthStore();
        const profileDir=${JSON.stringify(directory)};
        process.on('message',async()=>process.send({calls,healthy:await health.isHealthy(profileDir),state:JSON.parse(await readFile(profileDir+'/collector-health.json','utf8')).status}));
        const report={status:${JSON.stringify(status)},rankCount:0,syncUserCount:0,metadataUserCount:0,successUserCount:0,failedUserCount:0,scannedAttemptCount:0,acceptedAttemptCount:0,insertedAttemptCount:0,duplicateAttemptCount:0,errorCode:null};
        await new CollectorRuntime(new CollectorConfigLoader({profileDir,intervalMs:1,runOnce:${runOnce}}).parse(process.env),()=>({run:async()=>{calls++;return report;},close:async()=>{process.stdout.write('fixture-closed\\n');}})).run();
        process.disconnect();
      `,
          ],
          {
            cwd: new URL("..", import.meta.url),
            env: {
              ...process.env,
              JUNGOL_USERNAME: "fixture-only",
              JUNGOL_PASSWORD: "fixture-only",
              DB_PASSWORD: "fixture-only",
            },
            stdio: ["ignore", "pipe", "pipe", "ipc"],
          },
        );
        assert.ok(child.stdout);
        assert.ok(child.stderr);
        let output = "";
        let errors = "";
        let probed = false;
        let observed = false;
        child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
          output += chunk;
          if (
            !runOnce &&
            !probed &&
            output.includes("collector.circuit_opened")
          ) {
            probed = true;
            child.send("probe");
          }
        });
        child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
          errors += chunk;
        });
        child.on("message", (message: unknown) => {
          assert.deepEqual(message, {
            calls: 1,
            healthy: false,
            state: status,
          });
          observed = true;
          child.kill("SIGTERM");
        });
        try {
          const code = await new Promise<number | null>((resolve, reject) => {
            child.once("error", reject);
            child.once("close", resolve);
          });
          assert.equal(code, runOnce ? 1 : 0, errors);
          assert.equal(observed, !runOnce);
          assert.equal(output.includes("fixture-closed"), true);
          const health = z
            .object({ status: z.literal("stopped"), degraded: z.literal(true) })
            .parse(
              JSON.parse(
                await readFile(
                  join(directory, "collector-health.json"),
                  "utf8",
                ),
              ),
            );
          assert.equal(health.degraded, true);
          assert.equal(output.split("collector.circuit_opened").length - 1, 1);
        } finally {
          if (child.exitCode === null) child.kill("SIGKILL");
          await rm(directory, { recursive: true, force: true });
        }
      },
    );
  }
}
