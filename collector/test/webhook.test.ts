import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { pino } from "pino";
import type { ProjectionResult } from "../src/projection.js";
import { RankingBoardWebhookService } from "../src/ranking-board-webhook-service.js";
import {
  DiscordWebhookClient,
  type HookEndpoint,
  type HookStore,
  ProjectionNotificationService,
  WebhookBroadcaster,
  WebhookMessageFormatter,
  type WebhookTransport,
} from "../src/webhook.js";

const entries = Array.from({ length: 10 }, (_, index) => ({
  rank: index + 1,
  jungolName: `user-${index + 1}`,
  koreanName: index === 0 ? "홍`\n길동" : index === 1 ? "  " : null,
  bia: 12 - index,
}));

test("ranking board webhook message includes persisted rank, BIA, and optional Korean name", () => {
  const message = new WebhookMessageFormatter().format(entries);

  assert.equal(
    message,
    [
      "추첨 결과가 바뀌었습니다.",
      "https://bada.anacnu.kr 에서 자세히 확인하세요!",
      "",
      "1. `user-1(홍ˋ 길동)`: 12 BIA",
      "2. `user-2`: 11 BIA",
      ...entries
        .slice(2)
        .map(
          (entry) => `${entry.rank}. \`${entry.jungolName}\`: ${entry.bia} BIA`,
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

test("projection notification reads latest board only when projection changed", async () => {
  const calls: number[] = [];
  const changed: ProjectionResult = {
    kind: "changed",
    boardId: 7,
    entries: [{ userId: 1, jungolName: "user-1", score: 12 }],
  };
  const unchanged: ProjectionResult = { kind: "unchanged", boardId: 7 };
  const notifier = {
    notifyLatest: async () => {
      calls.push(1);
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

  assert.deepEqual(calls, [1]);
});

test("ranking board webhook skips empty latest boards", async () => {
  const sent: string[] = [];
  await new RankingBoardWebhookService(
    { readLatest: async () => [] },
    new WebhookBroadcaster(
      new FakeHookStore([{ id: 1, url: "https://example.test/1" }]),
      {
        send: async (url) => {
          sent.push(url);
          return { kind: "delivered" as const };
        },
      },
      new WebhookMessageFormatter(),
      pino({ enabled: false }),
    ),
  ).notifyLatest(new AbortController().signal);
  assert.deepEqual(sent, []);
});

test("broadcaster waits for each ten-hook batch and isolates delivery failures", async () => {
  const hooks = Array.from({ length: 21 }, (_, index) => ({
    id: index + 1,
    url: `https://example.test/${index + 1}`,
  }));
  let active = 0;
  let maximum = 0;
  let completed = 0;
  let secondBatchStartedAfterFirstFinished = false;
  let thirdBatchStartedAfterSecondFinished = false;
  const started: number[] = [];
  const transport: WebhookTransport = {
    send: async (url) => {
      active += 1;
      maximum = Math.max(maximum, active);
      const id = Number(url.slice(url.lastIndexOf("/") + 1));
      started.push(id);
      if (id === 11) secondBatchStartedAfterFirstFinished = completed === 10;
      if (id === 21) thirdBatchStartedAfterSecondFinished = completed === 20;
      await Promise.resolve();
      active -= 1;
      completed += 1;
      return url.endsWith("/7")
        ? { kind: "rejected", code: "http_500" }
        : { kind: "delivered" };
    },
  };
  const store = new FakeHookStore(hooks);
  const result = await new WebhookBroadcaster(
    store,
    transport,
    new WebhookMessageFormatter(),
    pino({ enabled: false }),
  ).broadcast(entries, new AbortController().signal);
  assert.equal(maximum, 10);
  assert.equal(secondBatchStartedAfterFirstFinished, true);
  assert.equal(thirdBatchStartedAfterSecondFinished, true);
  assert.deepEqual(result, { delivered: 20, rejected: 1 });
  assert.deepEqual(store.ignored, [7]);
});

test("Discord client classifies HTTP and Discord webhook failures", async (t) => {
  const received: unknown[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      received.push(JSON.parse(body));
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
  await new DiscordWebhookClient(1_000, 65_536, "content_and_text").send(
    `http://127.0.0.1:${address.port}/ok`,
    "ranking message",
    signal,
  );
  assert.deepEqual(received.at(-1), {
    content: "ranking message",
    text: "ranking message",
    allowed_mentions: { parse: [] },
  });
  assert.deepEqual(received[0], {
    content: "message",
    allowed_mentions: { parse: [] },
  });
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
