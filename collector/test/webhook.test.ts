import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { pino } from "pino";
import type { ProjectionResult } from "../src/projection.js";
import {
  DiscordWebhookClient,
  type HookEndpoint,
  type HookStore,
  ProjectionNotificationService,
  WebhookBroadcaster,
  WebhookMessageFormatter,
  type WebhookTransport,
} from "../src/webhook.js";

const entries = Array.from({ length: 12 }, (_, index) => ({
  userId: index + 1,
  jungolName: `user-${index + 1}`,
  score: 12 - index,
}));

test("webhook message contains the site link and only the first ten ranked users", () => {
  const message = new WebhookMessageFormatter().format(entries);

  assert.equal(
    message,
    [
      "추첨 결과가 바뀌었습니다.",
      "https://bada.anacnu.kr 에서 자세히 확인하세요!",
      "",
      ...entries
        .slice(0, 10)
        .map(
          (entry, index) =>
            `${index + 1}. \`${entry.jungolName}\`: ${entry.score} 문제`,
        ),
    ].join("\n"),
  );
});

test("broadcaster disables every endpoint rejected by delivery", async () => {
  const hooks = new FakeHookStore([
    { id: 1, url: "https://example.test/1" },
    { id: 2, url: "https://example.test/2" },
    { id: 3, url: "https://example.test/3" },
  ]);
  const transport = new FakeWebhookTransport(
    new Map([
      [1, { kind: "delivered" }],
      [2, { kind: "rejected", code: "http_500" }],
      [3, { kind: "rejected", code: "timeout" }],
    ]),
  );
  const broadcaster = new WebhookBroadcaster(
    hooks,
    transport,
    new WebhookMessageFormatter(),
    pino({ enabled: false }),
  );

  const result = await broadcaster.broadcast(
    entries,
    new AbortController().signal,
  );

  assert.deepEqual(result, { delivered: 1, rejected: 2 });
  assert.deepEqual(hooks.ignored, [2, 3]);
  assert.equal(transport.payloads.length, 3);
  assert.equal(transport.payloads[0]?.content.includes("user-1"), true);
});

test("projection notification broadcasts only a changed ranking", async () => {
  const calls: number[] = [];
  const changed: ProjectionResult = { kind: "changed", boardId: 7, entries };
  const unchanged: ProjectionResult = { kind: "unchanged", boardId: 7 };
  const notifier = {
    broadcast: async (ranking: readonly unknown[]) => {
      calls.push(ranking.length);
      return { delivered: 1, rejected: 0 };
    },
  };

  await new ProjectionNotificationService(
    { rebuild: async () => unchanged },
    notifier,
  ).run(new AbortController().signal);
  await new ProjectionNotificationService(
    { rebuild: async () => changed },
    notifier,
  ).run(new AbortController().signal);

  assert.deepEqual(calls, [12]);
});

test("Discord client classifies HTTP and Discord webhook failures", async (t) => {
  const server = createServer((request, response) => {
    if (request.url === "/ok") {
      response.writeHead(204).end();
      return;
    }
    if (request.url === "/discord") {
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ code: 10015 }));
      return;
    }
    response.writeHead(500).end("failure");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const client = new DiscordWebhookClient(1_000);
  const signal = new AbortController().signal;

  assert.deepEqual(
    await client.send(`http://127.0.0.1:${address.port}/ok`, "message", signal),
    { kind: "delivered" },
  );
  assert.deepEqual(
    await client.send(
      `http://127.0.0.1:${address.port}/discord`,
      "message",
      signal,
    ),
    { kind: "rejected", code: "discord_10015" },
  );
  assert.deepEqual(
    await client.send(
      `http://127.0.0.1:${address.port}/bad`,
      "message",
      signal,
    ),
    { kind: "rejected", code: "http_500" },
  );
});

class FakeHookStore implements HookStore {
  readonly ignored: number[] = [];

  constructor(private readonly hooks: readonly HookEndpoint[]) {}

  async readActive(): Promise<readonly HookEndpoint[]> {
    return this.hooks;
  }

  async ignore(ids: readonly number[]): Promise<void> {
    this.ignored.push(...ids);
  }
}

class FakeWebhookTransport implements WebhookTransport {
  readonly payloads: { readonly url: string; readonly content: string }[] = [];

  constructor(
    private readonly outcomes: ReadonlyMap<
      number,
      | { readonly kind: "delivered" }
      | { readonly kind: "rejected"; readonly code: string }
    >,
  ) {}

  async send(url: string, content: string) {
    this.payloads.push({ url, content });
    const id = Number(url.slice(url.lastIndexOf("/") + 1));
    return this.outcomes.get(id) ?? { kind: "delivered" as const };
  }
}
