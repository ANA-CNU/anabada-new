import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("Given WEBHOOK_URL is configured When runtime cycles succeed, remain pending, or fail Then only the failure reaches the emergency webhook", async (t) => {
  const received: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      received.push(body);
      response.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const profileRoot = await mkdtemp(
    join(tmpdir(), "collector-runtime-webhook-"),
  );
  t.after(() => rm(profileRoot, { recursive: true, force: true }));

  const cases = [
    { name: "success", pending: false, expectedExitCode: 0 },
    { name: "pending", pending: true, expectedExitCode: 0 },
    { name: "failed", pending: false, expectedExitCode: 1 },
  ] as const;
  for (const fixture of cases) {
    const result = await runRuntimeFixture({
      profileDir: join(profileRoot, fixture.name),
      webhookUrl: `http://127.0.0.1:${address.port}/collector`,
      status: fixture.name === "failed" ? "failed" : "success",
      pending: fixture.pending,
    });
    assert.equal(result.exitCode, fixture.expectedExitCode, result.diagnostics);
  }

  assert.equal(received.length, 1);
  const payload: unknown = JSON.parse(received[0] ?? "");
  assert.ok(
    typeof payload === "object" &&
      payload !== null &&
      "content" in payload &&
      typeof payload.content === "string",
  );
  assert.match(payload.content, /긴급 장애 알림/);
});

type RuntimeFixture = {
  readonly pending: boolean;
  readonly profileDir: string;
  readonly status: "success" | "failed";
  readonly webhookUrl: string;
};

async function runRuntimeFixture(
  fixture: RuntimeFixture,
): Promise<{ readonly diagnostics: string; readonly exitCode: number | null }> {
  const { PATH: executablePath } = process.env;
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
        import { CollectorRuntime } from "./src/main.ts";
        import { CollectorConfigLoader } from "./src/config.ts";
        const fixture = JSON.parse(process.env.COLLECTOR_RUNTIME_FIXTURE);
        const parsed = new CollectorConfigLoader({ profileDir: fixture.profileDir, runOnce: true }).parse({
          DB_PASSWORD: "fixture-only",
          JUNGOL_USERNAME: "fixture-only",
          JUNGOL_PASSWORD: "fixture-only",
          WEBHOOK_URL: "https://example.test/webhook",
        });
        const config = { ...parsed, emergencyWebhookUrl: fixture.webhookUrl };
        const report = {
          status: fixture.status,
          rankCount: 0,
          syncUserCount: 0,
          metadataUserCount: 0,
          successUserCount: 0,
          failedUserCount: fixture.status === "failed" ? 1 : 0,
          scannedAttemptCount: 0,
          acceptedAttemptCount: 0,
          insertedAttemptCount: 0,
          duplicateAttemptCount: 0,
          errorCode: fixture.status === "failed" ? "fixture_failure" : null,
          accountFailureCount: 0,
          accountFailures: [],
          commonFailures: [],
          pending: fixture.pending,
        };
        await new CollectorRuntime(config, () => ({
          run: async (_signal, trace) => {
            if (fixture.status === "success") trace.transaction("committed");
            return report;
          },
          close: async () => {},
        })).run();
      `,
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        COLLECTOR_RUNTIME_FIXTURE: JSON.stringify(fixture),
        PATH: executablePath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  assert.ok(child.stdout);
  assert.ok(child.stderr);
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return {
    exitCode,
    diagnostics: JSON.stringify({ exitCode, stderr, stdout }),
  };
}
