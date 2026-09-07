import { expect, test } from "bun:test";
import { createServer } from "node:http";
import {
  BackendEmergencyAlertFormatter,
  BackendEmergencyWebhook,
  type BackendEmergencyWebhookTransport,
  isEmergencyServerError,
} from "../src/emergency-webhook.js";

const incident = {
  code: "internal_server_error",
  occurredAt: new Date("2026-09-08T00:00:00Z"),
};

test("Given Elysia error codes When classifying Then only server failures are urgent", () => {
  expect(isEmergencyServerError("INTERNAL_SERVER_ERROR")).toBe(true);
  expect(isEmergencyServerError("UNKNOWN")).toBe(true);
  expect(isEmergencyServerError("VALIDATION")).toBe(false);
  expect(isEmergencyServerError("NOT_FOUND")).toBe(false);
  expect(isEmergencyServerError(500)).toBe(true);
  expect(isEmergencyServerError(400)).toBe(false);
});

test("Given a backend failure When formatting Then returns an actionable Discord Markdown alert", () => {
  const message = new BackendEmergencyAlertFormatter().format(incident);

  expect(message).toContain("# 🚨 ANABADA 긴급 장애 알림");
  expect(message).toContain("**서비스:** `anabada-backend`");
  expect(message).toContain("**오류 코드:** `internal_server_error`");
  expect(message).toContain("## 즉시 확인");
  expect(message).toContain("2026-09-08 09:00:00 KST");
});

test("Given no emergency URL When notifying Then performs no delivery", async () => {
  const transport = new RecordingTransport();
  const notifier = new BackendEmergencyWebhook(undefined, transport);

  const result = await notifier.notify(incident);

  expect(result).toBe("disabled");
  expect(transport.messages).toHaveLength(0);
});

test("Given a delivered backend incident When repeated Then suppresses the duplicate", async () => {
  const transport = new RecordingTransport();
  const notifier = new BackendEmergencyWebhook(
    "https://discord.com/api/webhooks/test/token",
    transport,
  );

  const first = await notifier.notify(incident);
  const second = await notifier.notify(incident);

  expect(first).toBe("delivered");
  expect(second).toBe("suppressed");
  expect(transport.messages).toHaveLength(1);
});

test("Given an in-flight backend alert When the same error repeats Then sends only once", async () => {
  const transport = new DeferredTransport();
  const notifier = new BackendEmergencyWebhook(
    "https://discord.com/api/webhooks/test/token",
    transport,
  );

  const first = notifier.notify(incident);
  const second = await notifier.notify(incident);
  transport.complete(true);

  expect(second).toBe("suppressed");
  expect(await first).toBe("delivered");
  expect(transport.calls).toBe(1);
});

test("Given a failed emergency delivery When the same error repeats Then backs off", async () => {
  const transport = new FailingTransport();
  const notifier = new BackendEmergencyWebhook(
    "https://discord.com/api/webhooks/test/token",
    transport,
  );

  const first = await notifier.notify(incident);
  const second = await notifier.notify(incident);

  expect(first).toBe("failed");
  expect(second).toBe("suppressed");
  expect(transport.calls).toBe(1);
});

test("Given a Discord endpoint When notifying Then posts the Markdown payload over HTTP", async () => {
  let received = "";
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      received += chunk;
    });
    request.on("end", () => response.writeHead(204).end());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    expect(address && typeof address !== "string").toBe(true);
    if (!address || typeof address === "string") throw new Error("fixture failed");
    const notifier = new BackendEmergencyWebhook(
      `http://127.0.0.1:${address.port}/incident`,
    );

    const result = await notifier.notify(incident);

    expect(result).toBe("delivered");
    expect(JSON.parse(received)).toEqual({
      content: new BackendEmergencyAlertFormatter().format(incident),
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Given a backend error log When emitted Then sends one emergency alert", async () => {
  let resolveMessage: (value: string) => void = () => {};
  const received = new Promise<string>((resolve) => {
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
  const previous = process.env.WEBHOOK_URL;
  try {
    const address = server.address();
    expect(address && typeof address !== "string").toBe(true);
    if (!address || typeof address === "string") throw new Error("fixture failed");
    process.env.WEBHOOK_URL = `http://127.0.0.1:${address.port}/incident`;
    const { logger } = await import(`../src/logger.js?test=${Date.now()}`);

    logger.error(
      { code: "fixture_error", err: new Error("sensitive fixture details") },
      "backend.fixture_failed",
    );

    const payload: unknown = JSON.parse(await received);
    expect(
      typeof payload === "object" &&
        payload !== null &&
        "content" in payload &&
        typeof payload.content === "string",
    ).toBe(true);
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("content" in payload) ||
      typeof payload.content !== "string"
    )
      throw new Error("fixture payload failed");
    expect(payload.content).toContain("**서비스:** `anabada-backend`");
    expect(payload.content).toContain("`fixture_error`");
    expect(payload.content).not.toContain("sensitive fixture details");
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_URL;
    else process.env.WEBHOOK_URL = previous;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

class RecordingTransport implements BackendEmergencyWebhookTransport {
  readonly messages: string[] = [];

  async send(_url: string, content: string): Promise<boolean> {
    this.messages.push(content);
    return true;
  }
}

class DeferredTransport implements BackendEmergencyWebhookTransport {
  calls = 0;
  private resolve: (delivered: boolean) => void = () => {};

  async send(): Promise<boolean> {
    this.calls += 1;
    return new Promise<boolean>((resolve) => {
      this.resolve = resolve;
    });
  }

  complete(delivered: boolean): void {
    this.resolve(delivered);
  }
}

class FailingTransport implements BackendEmergencyWebhookTransport {
  calls = 0;

  async send(): Promise<boolean> {
    this.calls += 1;
    return false;
  }
}
