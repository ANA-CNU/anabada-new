import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { z } from "zod";

for (const command of ["run-once", "start"]) {
  test(
    `CLI ${command} handles failed cycle with bounded cleanup`,
    { timeout: 10000 },
    async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "collector-cli-lifecycle-"),
      );
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
          import { CollectorApplication } from './src/application/application.ts';
          import { CollectorConfigLoader } from './src/config.ts';
          const loader = new CollectorConfigLoader({ profileDir: ${JSON.stringify(directory)}, database: { host: '127.0.0.1', port: 1, user: 'root', name: 'jungol_bada' } });
          await new CollectorApplication(process.env, loader).run(['node', 'collector', ${JSON.stringify(command)}]);
        `,
        ],
        {
          cwd: new URL("..", import.meta.url),
          env: {
            ...process.env,
            JUNGOL_USERNAME: "disposable-fixture-only",
            JUNGOL_PASSWORD: "disposable-fixture-only",
            DB_PASSWORD: "disposable-fixture-only",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      let errors = "";
      let stopped = false;
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        output += chunk;
        if (
          !stopped &&
          command === "start" &&
          output.includes("collector.cycle_failed")
        ) {
          stopped = true;
          child.kill("SIGTERM");
        }
      });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        errors += chunk;
      });
      try {
        const code = await new Promise<number | null>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", resolve);
        });
        assert.equal(code, command === "run-once" ? 1 : 0, errors);
        assert.equal(output.includes("disposable-fixture-only"), false);
        const health = z
          .object({
            status: z.literal("stopped"),
            lastStartedAt: z.number(),
            lastCompletedAt: z.number(),
            degraded: z.literal(true),
          })
          .parse(
            JSON.parse(
              await readFile(join(directory, "collector-health.json"), "utf8"),
            ),
          );
        assert.ok(health.lastCompletedAt >= health.lastStartedAt);
        assert.equal(output.split("collector.cycle_failed").length - 1, 1);
      } finally {
        if (child.exitCode === null) child.kill("SIGKILL");
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
