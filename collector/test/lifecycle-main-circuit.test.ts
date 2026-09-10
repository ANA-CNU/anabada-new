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
        const report={status:${JSON.stringify(status)},rankCount:0,syncUserCount:0,metadataUserCount:0,successUserCount:0,failedUserCount:0,scannedAttemptCount:0,acceptedAttemptCount:0,insertedAttemptCount:0,duplicateAttemptCount:0,errorCode:null,accountFailureCount:0,accountFailures:[],commonFailures:[]};
        const config=new CollectorConfigLoader({profileDir,intervalMs:1,runOnce:${runOnce}}).parse(process.env);
        process.on('message',async()=>process.send({calls,healthy:await health.isHealthy(profileDir),state:JSON.parse(await readFile(profileDir+'/collector-health.json','utf8')).status,runOnce:config.runOnce,webhookEnabled:config.emergencyWebhookUrl!==undefined}));
        await new CollectorRuntime(config,()=>({run:async()=>{calls++;return report;},close:async()=>{process.stdout.write('fixture-closed\\n');}}),{now:()=>0,delay:async(milliseconds,signal)=>{if(milliseconds===0)return;await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));}}).run();
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
              WEBHOOK_URL: "",
              COLLECTOR_RUN_ONCE: runOnce ? "true" : "false",
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
        let state: unknown;
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
          state = message;
          assert.deepEqual(message, {
            calls: 1,
            healthy: false,
            state: status,
            runOnce,
            webhookEnabled: false,
          });
          observed = true;
          child.kill("SIGTERM");
        });
        try {
          const code = await new Promise<number | null>((resolve, reject) => {
            child.once("error", reject);
            child.once("close", resolve);
          });
          const diagnostics = JSON.stringify({
            code,
            errors,
            observed,
            output,
            probed,
            runOnce,
            state,
          });
          assert.equal(code, runOnce ? 1 : 0, diagnostics);
          assert.equal(observed, !runOnce, diagnostics);
          assert.equal(output.includes("fixture-closed"), true, diagnostics);
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
