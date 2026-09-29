import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium } from "playwright";
import { AccountProfileCollector } from "../src/jungol/profile.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

const problemLinks = (start: number, count: number): string =>
  Array.from(
    { length: count },
    (_, index) => `<a href="/problem/${start + index}">${start + index}</a>`,
  ).join("");

const pageHtml = (solved: number): string => {
  const solvedGroups =
    solved === 0
      ? ""
      : `<section class="jgacc-sec"><div class="jgacc-sec-head"><h2 class="jgacc-sec-title">해결한 문제</h2><span class="jgacc-sec-count">${solved}</span></div><div class="jgacc-tiergroup"><button class="jgacc-tiergroup-head" aria-expanded="false" data-start="1000" data-count="2">Bronze 2</button><div class="problem-list"></div></div><div class="jgacc-tiergroup"><button class="jgacc-tiergroup-head" aria-expanded="false" data-start="2000" data-count="72">Unranked 72</button><div class="problem-list"></div></div></section>`;
  const wrongProblems = `<section class="jgacc-sec"><div class="jgacc-sec-head"><h2 class="jgacc-sec-title">틀린 문제</h2><span class="jgacc-sec-count">5</span></div><div class="jgacc-tiergroup"><button class="jgacc-tiergroup-head" aria-expanded="false" data-start="9000" data-count="5">Unranked 5</button><div class="problem-list">${problemLinks(9000, 5)}</div></div></section>`;
  return `<main><h1>profile</h1><div class="jgacc-row">가입일2020년</div><div class="jgacc-row">해결한 문제${solved}문제</div><div class="jgacc-sections">${solvedGroups}${wrongProblems}</div><script>document.querySelectorAll('.jgacc-tiergroup-head').forEach(button => button.addEventListener('click', () => { button.setAttribute('aria-expanded', 'true'); button.classList.add('open'); const list = button.parentElement?.querySelector('.problem-list'); for (let problem = Number(button.dataset.start); problem < Number(button.dataset.start) + Number(button.dataset.count); problem += 1) list?.insertAdjacentHTML('beforeend', \`<a href="/problem/\${problem}">\${problem}</a>\`); }));</script></main>`;
};

test("Given an account profile with an expandable solved card When collecting Then it returns every advertised problem", async (t) => {
  const server = createServer((request, response) => {
    const solved =
      new URL(request.url ?? "/", "http://localhost").pathname === "/zero"
        ? 0
        : 74;
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
  assert.equal((await collector.collectSolved(page)).length, 74);
  await page.goto(`${settings.baseUrl}/zero`);
  assert.deepEqual(await collector.collectSolved(page), []);
});

test("Given a loading profile whose summary is a dash When the solved groups hydrate Then collection waits for all 74 problems", async (t) => {
  const hydrated = `<h1>profile</h1><div class="jgacc-row">해결한 문제74문제</div><div class="jgacc-sections"><section class="jgacc-sec"><div class="jgacc-sec-head"><h2 class="jgacc-sec-title">해결한 문제</h2><span class="jgacc-sec-count">74</span></div><div class="problem-list">${problemLinks(1000, 74)}</div></section></div>`;
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      `<main><h1>profile</h1><div class="jgacc-row">해결한 문제-문제</div><script>setTimeout(() => document.querySelector('main').innerHTML = ${JSON.stringify(hydrated)}, 500)</script></main>`,
    );
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
  const page = await browser.newPage();
  await page.goto(settings.baseUrl);
  const collector = new AccountProfileCollector(
    settings,
    new JungolRequestCoordinator({ delay: async () => {} }),
  );
  assert.equal((await collector.collectSolved(page)).length, 74);
});

test("Given a private profile When collecting solved problems Then it rejects the account summary", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end("<main><h1>profile</h1><p>비공개 프로필이에요</p></main>");
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
  const page = await browser.newPage();
  await page.goto(settings.baseUrl);
  const collector = new AccountProfileCollector(
    settings,
    new JungolRequestCoordinator({ delay: async () => {} }),
  );
  await assert.rejects(collector.collectSolved(page), {
    code: "account_summary_invalid",
  });
});

test("Given incomplete expanded solved links or a delayed private notice When collecting Then the account summary fails closed", async (t) => {
  const partial = `<main><h1>profile</h1><div class="jgacc-row">해결한 문제74문제</div><div class="jgacc-sections"><section class="jgacc-sec"><div class="jgacc-sec-head"><h2 class="jgacc-sec-title">해결한 문제</h2><span class="jgacc-sec-count">74</span></div><div class="jgacc-tiergroup"><button class="jgacc-tiergroup-head" aria-expanded="true">Unranked 74</button><div class="problem-list">${problemLinks(1000, 73)}</div></div></section></div></main>`;
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/private-delayed") {
      response.end(
        "<main><h1>profile</h1><script>setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<p>비공개 프로필이에요</p>'), 100)</script></main>",
      );
      return;
    }
    response.end(partial);
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
    pageTimeoutMs: 1_000,
  };
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const collector = new AccountProfileCollector(
    settings,
    new JungolRequestCoordinator({ delay: async () => {} }),
  );
  await page.goto(`${settings.baseUrl}/partial`);
  await assert.rejects(collector.collectSolved(page), {
    code: "account_summary_invalid",
  });
  await page.goto(`${settings.baseUrl}/private-delayed`);
  await assert.rejects(collector.collectSolved(page), {
    code: "account_summary_invalid",
  });
});
