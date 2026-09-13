import assert from "node:assert/strict";
import { problemIdSchema } from "../src/domain.js";
import { ProblemMetadataResolver } from "../src/jungol/metadata.js";
import {
  asyncBrowserFixture,
  FetchGate,
  browserTest as test,
  tracked,
} from "./async-browser-fixture.js";

test("Given an HTML shell When metadata arrives through fetch Then the real resolver waits instead of caching tier zero", async (t) => {
  // Given: HTML 제목조차 fetch 이후에 생긴다.
  const gate = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    `<main></main><script>fetch('/fixture/metadata').then(r=>r.text()).then(html=>document.querySelector('main').innerHTML=html)</script>`,
    new Map([["/fixture/metadata", gate]]),
  );
  const resolver = new ProblemMetadataResolver(settings, requests);
  // When
  const operation = tracked(
    resolver.resolve(page, problemIdSchema.parse(1000)),
  );
  await gate.requested;
  let nextStarted = false;
  const queued = requests.schedule("rank_page", undefined, async () => {
    nextStarted = true;
  });
  await page.waitForLoadState("load");
  await page.evaluate(() => document.readyState);
  const premature = operation.settled();
  assert.equal(
    nextStarted,
    false,
    "metadata readiness must retain the shared request slot",
  );
  gate.release(
    '<h1 data-problem-title>Fetched problem</h1><span data-tier="11"></span>',
  );
  const result = await operation.result;
  await queued;
  // Then
  assert.equal(premature, false, "document load is not metadata readiness");
  assert.ok(result.ok);
  assert.deepEqual(result.value, {
    problemId: 1000,
    title: "Fetched problem",
    tier: 11,
  });
  assert.deepEqual(
    await resolver.resolve(page, problemIdSchema.parse(1000)),
    result.value,
  );
});

test("Given a title shell When tier fetch is still pending Then it does not finalize metadata prematurely", async (t) => {
  const gate = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    `<h1 data-problem-title>Fetched problem</h1><script>fetch('/fixture/tier').then(r=>r.text()).then(html=>document.body.insertAdjacentHTML('beforeend',html))</script>`,
    new Map([["/fixture/tier", gate]]),
  );
  const operation = tracked(
    new ProblemMetadataResolver(settings, requests).resolve(
      page,
      problemIdSchema.parse(1000),
    ),
  );
  await gate.requested;
  await page.waitForLoadState("load");
  await page.evaluate(() => document.readyState);
  const premature = operation.settled();
  gate.release('<span data-tier="15"></span>');
  const result = await operation.result;
  assert.equal(
    premature,
    false,
    "a title alone does not prove tier fetch has finished",
  );
  assert.ok(result.ok);
  assert.equal(result.value.tier, 15);
});

test("Given the actual Jungol tier-image structure When metadata loads Then title excludes icons and resource limits", async (t) => {
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    '<h1><div><img src="https://s.jungol.co.kr/solved/1.svg?dm=jungol.co.kr"><span>keep</span></div><span>두 정수 더하기 (A+B)</span><span class="limit">timer 1s memory 4MB</span></h1>',
    new Map(),
  );
  const result = await new ProblemMetadataResolver(settings, requests).resolve(
    page,
    problemIdSchema.parse(1000),
  );
  assert.equal(result.tier, 1);
  assert.equal(result.title, "두 정수 더하기 (A+B)");
});

for (const fixture of [
  { html: "<main>로그인이 필요해요</main>", code: "auth_required" },
  {
    html: '<form id="challenge-form">Verify you are human</form>',
    code: "manual_recovery_required",
  },
] as const) {
  test(`Given JS renders ${fixture.code} When metadata is requested Then it is not cached as tier zero`, async (t) => {
    const gate = new FetchGate();
    const { page, settings, requests } = await asyncBrowserFixture(
      t,
      `<main></main><script>fetch('/fixture/access').then(r=>r.text()).then(html=>document.body.innerHTML=html)</script>`,
      new Map([["/fixture/access", gate]]),
    );
    const operation = tracked(
      new ProblemMetadataResolver(
        { ...settings, pageTimeoutMs: 250 },
        requests,
      ).resolve(page, problemIdSchema.parse(1000)),
    );
    await gate.requested;
    gate.release(fixture.html);
    const result = await operation.result;
    assert.equal(result.ok, false);
    if (!result.ok)
      assert.equal(Reflect.get(Object(result.error), "code"), fixture.code);
  });
}

for (const tier of ["0", "32"]) {
  test(`Given a fetched tier ${tier} When metadata resolves Then the existing unknown-tier policy remains bounded`, async (t) => {
    const { page, settings, requests } = await asyncBrowserFixture(
      t,
      `<h1 data-problem-title>Title</h1><span data-tier="${tier}"></span>`,
      new Map(),
    );
    const value = await new ProblemMetadataResolver(settings, requests).resolve(
      page,
      problemIdSchema.parse(1),
    );
    assert.equal(value.tier, 0);
    assert.equal(value.title, tier === "0" ? "Title" : null);
  });
}

test("Given metadata never appears When its readiness timeout expires Then the cycle receives a failure instead of tier zero", async (t) => {
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    "<main>unavailable metadata</main>",
    new Map(),
  );
  await assert.rejects(
    new ProblemMetadataResolver(
      { ...settings, pageTimeoutMs: 100 },
      requests,
    ).resolve(page, problemIdSchema.parse(1)),
    { code: "problem_metadata_timeout" },
  );
});

for (const status of [403, 429]) {
  test(`Given metadata fetch returns HTTP ${status} When its DOM remains empty Then access rejection is not tier-zero fallback`, async (t) => {
    const gate = new FetchGate();
    const { page, settings, requests } = await asyncBrowserFixture(
      t,
      `<main></main><script>fetch('/api/problem/1000').then(r=>r.text())</script>`,
      new Map([["/api/problem/1000", gate]]),
    );
    const operation = tracked(
      new ProblemMetadataResolver(
        { ...settings, pageTimeoutMs: 150 },
        requests,
      ).resolve(page, problemIdSchema.parse(1000)),
    );
    await gate.requested;
    gate.release("", status);
    const result = await operation.result;
    assert.equal(result.ok, false);
    if (!result.ok)
      assert.equal(
        Reflect.get(Object(result.error), "code"),
        "jungol_http_rejected",
      );
  });
}
