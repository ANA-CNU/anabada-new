import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { z } from "zod";

type Fixture = {
  readonly child: ChildProcess;
  readonly close: Promise<number | null>;
  readonly cycleFailureCount: () => number;
  readonly directory: string;
  readonly failedReport: Promise<void>;
  readonly secretDetected: () => boolean;
  readonly stop: () => Promise<void>;
};

async function listenForRejectedMysqlConnections(): Promise<Server> {
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

async function startFixture(options: {
  readonly command: "run-once" | "start";
  readonly collectorRunOnce: boolean;
}): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "collector-cli-lifecycle-"));
  let server: Server | undefined;
  let child: ChildProcess | undefined;
  let deadline: NodeJS.Timeout | undefined;
  let stopping: Promise<void> | undefined;
  let resolveFailedReport: () => void = () => {};
  let rejectFailedReport: (error: Error) => void = () => {};
  let observedFailure = false;
  let cycleFailures = 0;
  let secretDetected = false;
  let pendingOutput = "";
  const failedReport = new Promise<void>((resolve, reject) => {
    resolveFailedReport = resolve;
    rejectFailedReport = reject;
  });
  try {
    server = await listenForRejectedMysqlConnections();
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
        import { CollectorApplication } from "./src/application/application.ts";
        import { CollectorConfigLoader } from "./src/config.ts";
        const loader = new CollectorConfigLoader({
          profileDir: ${JSON.stringify(directory)},
          // 실제 시계 slot을 쓰되 부모가 첫 실패를 관찰하고 SIGTERM을 보낼 여유를 남긴다.
          intervalMs: 1_000,
          database: { host: "127.0.0.1", port: ${address.port}, user: "root", name: "jungol_bada" },
        });
        await new CollectorApplication(process.env, loader).run(["node", "collector", ${JSON.stringify(options.command)}]);
      `,
      ],
      {
        cwd: new URL("..", import.meta.url),
        env: {
          ...process.env,
          COLLECTOR_RUN_ONCE: options.collectorRunOnce ? "true" : "false",
          WEBHOOK_URL: "",
          JUNGOL_USERNAME: "disposable-fixture-only",
          JUNGOL_PASSWORD: "disposable-fixture-only",
          DB_PASSWORD: "disposable-fixture-only",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    await new Promise<void>(
      (resolve) => server?.close(() => resolve()) ?? resolve(),
    );
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  assert.ok(child.stdout);
  assert.ok(child.stderr);
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    secretDetected ||= chunk.includes("disposable-fixture-only");
    pendingOutput = `${pendingOutput}${chunk}`.slice(-65_536);
    const lines = pendingOutput.split("\n");
    pendingOutput = lines.pop() ?? "";
    for (const line of lines) {
      if (line.includes('"msg":"cycle failed"')) {
        cycleFailures += 1;
        if (!observedFailure) {
          observedFailure = true;
          resolveFailedReport();
        }
      }
    }
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    secretDetected ||= chunk.includes("disposable-fixture-only");
  });
  const close = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (!observedFailure)
        rejectFailedReport(new Error("collector exited before cycle failure"));
      resolve(code);
    });
  });
  const stop = () => {
    if (stopping) return stopping;
    stopping = (async () => {
      if (deadline) clearTimeout(deadline);
      if (child.exitCode === null) child.kill("SIGKILL");
      await close.catch(() => {});
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    })();
    return stopping;
  };
  deadline = setTimeout(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  }, 25_000);
  return {
    child,
    close,
    cycleFailureCount: () => cycleFailures,
    directory,
    failedReport,
    secretDetected: () => secretDetected,
    stop,
  };
}

async function assertStoppedHealth(directory: string): Promise<void> {
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
}

for (const command of ["run-once", "start"] as const) {
  test(
    `CLI ${command} handles a returned failed cycle with bounded cleanup`,
    { timeout: 30_000 },
    async (t) => {
      const fixture = await startFixture({ command, collectorRunOnce: false });
      t.signal.addEventListener("abort", () => void fixture.stop(), {
        once: true,
      });
      t.after(fixture.stop);

      await fixture.failedReport;
      if (command === "start") fixture.child.kill("SIGTERM");

      assert.equal(await fixture.close, command === "run-once" ? 1 : 0);
      await assertStoppedHealth(fixture.directory);
      assert.equal(fixture.cycleFailureCount(), 1);
      assert.equal(fixture.secretDetected(), false);
    },
  );
}

test(
  "CLI start honors COLLECTOR_RUN_ONCE without a scheduled retry",
  { timeout: 30_000 },
  async (t) => {
    const fixture = await startFixture({
      command: "start",
      collectorRunOnce: true,
    });
    t.signal.addEventListener("abort", () => void fixture.stop(), {
      once: true,
    });
    t.after(fixture.stop);

    await fixture.failedReport;
    assert.equal(await fixture.close, 1);
    await assertStoppedHealth(fixture.directory);
    assert.equal(fixture.cycleFailureCount(), 1);
    assert.equal(fixture.secretDetected(), false);
  },
);
