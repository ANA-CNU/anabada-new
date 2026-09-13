import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import test, { type TestContext } from "node:test";
import { chromium } from "playwright";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

export const browserTest = (
  name: string,
  run: (t: TestContext) => Promise<void>,
) => test(name, { timeout: 15_000 }, run);

/** 실제 HTTP 응답을 테스트가 해제할 때까지 보류한다. 시간 기반 sleep은 사용하지 않는다. */
export class FetchGate {
  private response: ServerResponse | undefined;
  private arrived: () => void = () => {};
  readonly requested = new Promise<void>((resolve) => {
    this.arrived = resolve;
  });
  accept(response: ServerResponse): void {
    assert.ok(this.response === undefined, "gate received duplicate fetch");
    this.response = response;
    this.arrived();
  }
  release(body: string | Uint8Array, status = 200): void {
    assert.ok(this.response, "release only after actual browser fetch");
    if (!this.response.headersSent)
      this.response.writeHead(status, {
        "content-type":
          typeof body === "string"
            ? "text/plain; charset=utf-8"
            : "application/octet-stream",
      });
    this.response.end(body);
  }
  sendHeaders(): void {
    assert.ok(this.response);
    this.response.writeHead(200, {
      "content-type": "application/octet-stream",
    });
    this.response.flushHeaders();
  }
}

/** 정올만 HTTP fixture로 대체하고 Chromium·page·collector는 실제 구현을 사용한다. */
export async function asyncBrowserFixture(
  t: TestContext,
  html: string | ReadonlyMap<string, string>,
  gates: ReadonlyMap<string, FetchGate>,
) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture");
    const path = url.pathname;
    const gate = gates.get(path + url.search) ?? gates.get(path);
    if (gate) return gate.accept(response);
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      typeof html === "string"
        ? path === "/auth/signin"
          ? "<main>로그인 폼을 제공하지 않는 실패 fixture</main>"
          : html
        : (html.get(path) ?? "<main>not found</main>"),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("https://**", (route) => route.abort());
  const requests = new JungolRequestCoordinator({ delay: async () => {} });
  t.after(() => requests.close());
  return {
    browser,
    page,
    requests,
    settings: {
      baseUrl: `http://127.0.0.1:${address.port}`,
      pageTimeoutMs: 1500,
    },
  };
}

/** rejection handler도 즉시 연결하여 의도적인 실패 검증이 unhandled rejection을 만들지 않는다. */
export function tracked<T>(operation: Promise<T>) {
  let settled = false;
  const result = operation.then(
    (value) => {
      settled = true;
      return { ok: true, value } as const;
    },
    (error: unknown) => {
      settled = true;
      return { ok: false, error } as const;
    },
  );
  return { result, settled: () => settled };
}

export const rankHtml = `<table><thead><tr><th>등수</th><th>계정</th><th>푼 문제</th><th>틀린 문제</th><th>스트릭</th><th>AC 레이팅</th></tr></thead><tbody></tbody></table>`;
export const rankRow = `<tr><td>1</td><td><a class="chip" href="/account/42">member</a></td><td>12문제</td><td>2문제</td><td>0일</td><td>800</td></tr>`;
export const profileHtml = `<div><span>맞은 문제</span>3문제</div><section class="card"><h2>check 해결한 문제</h2><div class="problem-list"></div><button>expand_more</button></section>`;
