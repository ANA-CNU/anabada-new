import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium } from "playwright";
import { AccountSyncPlan, rankMemberSchema } from "../src/domain/sync.js";
import { AccountSummaryCollector } from "../src/jungol/account-summary.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

const plan = (solvedCount: number) =>
  new AccountSyncPlan(
    "initial_summary",
    rankMemberSchema.parse({
      accountId: "42",
      jungolName: "member",
      solvedCount,
      wrongCount: 0,
      acRating: 0,
      tier: 0,
    }),
    0n,
    solvedCount,
    1,
  );

const account = (
  matched: string,
  links: string,
  wrongLinks = '<a href="/problem/999">999</a>',
) =>
  `<main><div><span>맞은 문제</span><strong>${matched}</strong></div><section class="card"><header><p class="section-title"><span>check</span>해결한 문제</p></header><div class="problem-list"><div class="problems collapsed">${links}</div></div></section><section class="card"><p class="section-title">틀린 문제</p><div class="problem-list"><div class="problems collapsed">${wrongLinks}</div></div></section><a href="/problem/888">888</a></main>`;

test("Given a solved list that renders after its account headings When collecting the baseline Then it waits for the complete list", async (t) => {
  let accountCalls = 0;
  const server = createServer((_request, response) => {
    accountCalls += 1;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      `<main><button style="visibility:hidden">로그인</button><div><span>맞은 문제</span><strong>2문제</strong></div><section class="card"><header><p class="section-title"><span>check</span>해결한 문제</p></header><div class="problem-list" id="solved"></div></section><section class="card"><p>틀린 문제</p><div class="problem-list"><a href="/problem/999">999</a></div></section><script>setTimeout(() => { document.querySelector("#solved").outerHTML = '<div class="problem-list" id="solved"><div class="problems collapsed"><a href="/problem/100"></a><a href="/problem/200"></a></div></div>'; setTimeout(() => { document.querySelectorAll("#solved a")[0].textContent = "100"; document.querySelectorAll("#solved a")[1].textContent = "200"; }, 50); }, 200);</script></main>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  t.after(() => page.close());
  const coordinator = new JungolRequestCoordinator({ delay: async () => {} });
  const collector = new AccountSummaryCollector(
    { baseUrl: `http://127.0.0.1:${address.port}`, pageTimeoutMs: 3000 },
    coordinator,
  );

  const completion: string[] = [];
  const solvedPromise = collector.collect(page, plan(2)).then((solved) => {
    completion.push("summary");
    return solved;
  });
  const queued = coordinator.schedule("rank_page", undefined, async () => {
    completion.push("rank");
  });
  const solved = await solvedPromise;
  await queued;

  assert.deepEqual(
    solved.map((problem) => problem.problemId),
    [100, 200],
  );
  assert.equal(accountCalls, 1);
  assert.deepEqual(completion, ["summary", "rank"]);
});

test("Given verified card sections with solved and wrong problem links When collecting the baseline Then only the solved card list is read", async (t) => {
  const solvedLinks = Array.from(
    { length: 41 },
    (_, index) => `<a href="/problem/${index + 1}">${index + 1}</a>`,
  ).join("");
  const wrongLinks = Array.from(
    { length: 10 },
    (_, index) => `<a href="/problem/${index + 101}">${index + 101}</a>`,
  ).join("");
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(account("41문제", solvedLinks, wrongLinks));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  t.after(() => page.close());
  const collector = new AccountSummaryCollector(
    { baseUrl: `http://127.0.0.1:${address.port}`, pageTimeoutMs: 3000 },
    new JungolRequestCoordinator({ delay: async () => {} }),
  );

  const solved = await collector.collect(page, plan(41));

  assert.deepEqual(
    solved.map((problem) => problem.problemId),
    Array.from({ length: 41 }, (_, index) => index + 1),
  );
});

test("Given late authentication, challenge, or cancellation When summary readiness waits Then it keeps the bounded safe error codes", async (t) => {
  let responseCount = 0;
  const server = createServer((_request, response) => {
    responseCount += 1;
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (responseCount === 1) {
      response.end(
        `<main id="root"></main><script>setTimeout(() => { document.querySelector("#root").innerHTML = '<button>로그인</button>'; }, 50);</script>`,
      );
      return;
    }
    if (responseCount === 2) {
      response.end(
        `<main id="root"></main><script>setTimeout(() => { document.querySelector("#root").textContent = 'CAPTCHA challenge'; }, 50);</script>`,
      );
      return;
    }
    response.end("<main>loading</main>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const collector = new AccountSummaryCollector(
    { baseUrl: `http://127.0.0.1:${address.port}`, pageTimeoutMs: 200 },
    new JungolRequestCoordinator({ delay: async () => {} }),
  );

  const authPage = await browser.newPage();
  t.after(() => authPage.close());
  await assert.rejects(collector.collect(authPage, plan(0)), {
    code: "auth_required",
  });

  const challengePage = await browser.newPage();
  t.after(() => challengePage.close());
  await assert.rejects(collector.collect(challengePage, plan(0)), {
    code: "manual_recovery_required",
  });

  const cancelledPage = await browser.newPage();
  t.after(() => cancelledPage.close());
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(
    collector.collect(cancelledPage, plan(0), controller.signal),
    {
      code: "cancelled",
    },
  );
});
