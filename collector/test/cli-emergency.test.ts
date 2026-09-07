import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

test("Given invalid startup config and WEBHOOK_URL When run-once starts Then sends an emergency alert", async (t) => {
  let resolveMessage: (body: string) => void = () => {};
  const message = new Promise<string>((resolve) => {
    resolveMessage = resolve;
  });
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      resolveMessage(body);
      response.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const { PATH: executablePath } = process.env;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "run-once"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        PATH: executablePath,
        WEBHOOK_URL: `http://127.0.0.1:${address.port}/incident`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let timeout: NodeJS.Timeout | undefined;
  const timeoutResult = new Promise<string>((resolve) => {
    timeout = setTimeout(() => resolve("timeout"), 2_000);
  });
  const [exitCode, body] = await Promise.all([
    new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    }),
    Promise.race([message, timeoutResult]),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });

  assert.equal(exitCode, 1);
  assert.notEqual(body, "timeout");
  const payload: unknown = JSON.parse(body);
  assert.ok(
    typeof payload === "object" &&
      payload !== null &&
      "content" in payload &&
      typeof payload.content === "string",
  );
  assert.match(payload.content, /`invalid_config`/);
});
