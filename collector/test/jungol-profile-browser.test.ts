import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium } from "playwright";
import { AccountProfileCollector } from "../src/jungol/profile.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

const pageHtml = (solved: number): string => {
  const links = Array.from({ length: Math.min(solved, 50) }, (_, index) => {
    const problem = index + 1;
    return `<a href="/problem/${problem}">${problem}</a>`;
  }).join("");
  const card =
    solved === 0
      ? ""
      : `<section class="card"><h2>check 해결한 문제</h2><div class="problem-list">${links}</div><button>expand_more</button></section>`;
  return `<main><div><span>맞은 문제</span>${solved}문제</div>${card}<script>document.querySelector("button")?.addEventListener("click", () => { const list = document.querySelector(".problem-list"); for (let problem = 51; problem <= ${solved}; problem += 1) list?.insertAdjacentHTML("beforeend", \`<a href="/problem/\${problem}">\${problem}</a>\`); });</script></main>`;
};

test("Given an account profile with an expandable solved card When collecting Then it returns every advertised problem", async (t) => {
  const server = createServer((request, response) => {
    const solved =
      new URL(request.url ?? "/", "http://localhost").pathname === "/zero"
        ? 0
        : 73;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(pageHtml(solved));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const settings = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    pageTimeoutMs: 3_000,
  };
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  t.after(() => browser.close());
  const requests = new JungolRequestCoordinator({ delay: async () => {} });
  const collector = new AccountProfileCollector(settings, requests);
  const page = await browser.newPage();

  await page.goto(`${settings.baseUrl}/full`);
  assert.equal((await collector.collectSolved(page)).length, 73);
  await page.goto(`${settings.baseUrl}/zero`);
  assert.deepEqual(await collector.collectSolved(page), []);
});
