import assert from "node:assert/strict";
import { AccountSyncPlan, rankMemberSchema } from "../src/domain/sync.js";
import { AccountSummaryCollector } from "../src/jungol/account-summary.js";
import { AccountProfileCollector } from "../src/jungol/profile.js";
import {
  asyncBrowserFixture,
  FetchGate,
  browserTest as test,
  tracked,
} from "./async-browser-fixture.js";

const links = (start: number, end: number) =>
  Array.from(
    { length: end - start + 1 },
    (_, index) => `<a href="/problem/${start + index}">${start + index}</a>`,
  ).join("");

test("Given 50 of 73 solved links When expand triggers a delayed fetch Then the actual profile collector returns all 73", async (t) => {
  const gate = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    `<div><span>맞은 문제</span>73문제</div><section class="card"><h2>check 해결한 문제</h2><div class="problem-list">${links(1, 50)}</div><button onclick="fetch('/fixture/more').then(r=>r.text()).then(html=>document.querySelector('.problem-list').insertAdjacentHTML('beforeend',html))">expand_more</button></section>`,
    new Map([["/fixture/more", gate]]),
  );
  await page.goto(settings.baseUrl);
  const operation = tracked(
    new AccountProfileCollector(settings, requests).collectSolved(page),
  );
  await gate.requested;
  assert.equal(operation.settled(), false);
  assert.equal(await page.locator(".problem-list a").count(), 50);
  gate.release(links(51, 73));
  const result = await operation.result;
  assert.ok(result.ok);
  assert.deepEqual(
    result.value,
    Array.from({ length: 73 }, (_, index) => index + 1),
  );
});

test("Given an empty profile shell When fetch confirms zero solved Then zero is accepted after hydration", async (t) => {
  const gate = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    `<main></main><script>fetch('/fixture/profile').then(r=>r.text()).then(html=>document.querySelector('main').innerHTML=html)</script>`,
    new Map([["/fixture/profile", gate]]),
  );
  await page.goto(settings.baseUrl);
  const operation = tracked(
    new AccountProfileCollector(settings, requests).collectSolved(page),
  );
  await gate.requested;
  assert.equal(operation.settled(), false);
  gate.release("<div><span>맞은 문제</span>0문제</div>");
  const result = await operation.result;
  assert.ok(result.ok);
  assert.deepEqual(result.value, []);
});

test("Given a profile fetch that never renders data When cancelled Then no baseline is returned", async (t) => {
  const gate = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    `<main></main><script>fetch('/fixture/profile')</script>`,
    new Map([["/fixture/profile", gate]]),
  );
  await page.goto(settings.baseUrl);
  const abort = new AbortController();
  const operation = tracked(
    new AccountProfileCollector(settings, requests).collectSolved(
      page,
      abort.signal,
    ),
  );
  await gate.requested;
  abort.abort();
  const result = await operation.result;
  assert.equal(result.ok, false);
  if (!result.ok)
    assert.equal(Reflect.get(Object(result.error), "code"), "cancelled");
});

test("Given the legacy summary adapter When profile content is fetched after navigation Then the actual collector reads only the solved section", async (t) => {
  const gate = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    `<main></main><script>fetch('/fixture/profile').then(r=>r.text()).then(html=>document.querySelector('main').innerHTML=html)</script>`,
    new Map([["/fixture/profile", gate]]),
  );
  const member = rankMemberSchema.parse({
    accountId: "42",
    jungolName: "member",
    solvedCount: 2,
    wrongCount: 0,
    acRating: 0,
    tier: 0,
  });
  const operation = tracked(
    new AccountSummaryCollector(settings, requests).collect(
      page,
      new AccountSyncPlan("initial_summary", member, 0n, 2, 1),
    ),
  );
  await gate.requested;
  await page.waitForLoadState("load");
  assert.equal(operation.settled(), false);
  gate.release(
    `<div><span>맞은 문제</span>2문제</div><section class="card"><p class="section-title">check 해결한 문제</p><div class="problem-list"><div class="problems collapsed">${links(1, 2)}</div></div></section><a href="/problem/999">999</a>`,
  );
  const result = await operation.result;
  assert.ok(result.ok);
  assert.deepEqual(
    result.value.map((row) => row.problemId),
    [1, 2],
  );
});
