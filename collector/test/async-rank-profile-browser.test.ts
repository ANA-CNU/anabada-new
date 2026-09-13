import assert from "node:assert/strict";
import { JungolError } from "../src/jungol/errors.js";
import { AccountProfileCollector } from "../src/jungol/profile.js";
import { RankCollector } from "../src/jungol/rank.js";
import {
  asyncBrowserFixture,
  FetchGate,
  profileHtml,
  rankHtml,
  rankRow,
  browserTest as test,
  tracked,
} from "./async-browser-fixture.js";

for (const surface of ["rank", "profile"] as const) {
  test(`Given a ${surface} loading placeholder When fetch never finishes Then the parser waits until the readiness timeout instead of rejecting the shell`, async (t) => {
    const gate = new FetchGate();
    const shell =
      surface === "rank"
        ? rankHtml.replace(
            "<tbody></tbody>",
            '<tbody><tr><td colspan="6">로드 중...</td></tr></tbody>',
          )
        : profileHtml.replace("<button>expand_more</button>", "");
    const { page, settings, requests } = await asyncBrowserFixture(
      t,
      `${shell}<script>fetch('/fixture/pending')</script>`,
      new Map([["/fixture/pending", gate]]),
    );
    const bounded = { ...settings, pageTimeoutMs: 200 };
    if (surface === "profile") await page.goto(settings.baseUrl);
    const operation = tracked(
      surface === "rank"
        ? new RankCollector(bounded, requests)
            .collect(page, 1125)
            .then(() => undefined)
        : new AccountProfileCollector(bounded, requests)
            .collectSolved(page)
            .then(() => undefined),
    );
    await gate.requested;
    const result = await operation.result;
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error instanceof JungolError);
      assert.equal(
        result.error.diagnostics?.reason,
        "timeout",
        "a loading shell is not malformed final data",
      );
    }
  });
}

test("Given rank headers only When fetch later renders members Then the actual rank parser returns fetched rating and identity", async (t) => {
  const gate = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    `${rankHtml}<script>fetch('/api/rank/group/1125').then(r=>r.text()).then(html=>document.querySelector('tbody').innerHTML=html)</script>`,
    new Map([["/api/rank/group/1125", gate]]),
  );
  const operation = tracked(
    new RankCollector(settings, requests).collect(page, 1125),
  );
  await gate.requested;
  await page.waitForLoadState("load");
  assert.equal(operation.settled(), false);
  gate.release(rankRow);
  const result = await operation.result;
  assert.ok(result.ok);
  assert.equal(result.value.length, 1);
  assert.equal(result.value[0]?.accountId, "42");
  assert.equal(result.value[0]?.jungolName, "member");
  assert.equal(result.value[0]?.acRating, 800);
  assert.equal(result.value[0]?.tier, 11);
});

test("Given a rank loading row When fetch replaces it Then placeholder text is not parsed as real data", async (t) => {
  const gate = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    `${rankHtml.replace("<tbody></tbody>", '<tbody><tr><td colspan="6">로드 중...</td></tr></tbody>')}<script>fetch('/api/rank/group/1125').then(r=>r.text()).then(html=>document.querySelector('tbody').innerHTML=html)</script>`,
    new Map([["/api/rank/group/1125", gate]]),
  );
  const operation = tracked(
    new RankCollector(settings, requests).collect(page, 1125),
  );
  await gate.requested;
  await page.waitForLoadState("load");
  await page.evaluate(() => document.readyState);
  const premature = operation.settled();
  gate.release(rankRow);
  const result = await operation.result;
  assert.equal(premature, false);
  assert.ok(result.ok);
  assert.equal(result.value[0]?.acRating, 800);
});

test("Given a profile whose count arrives before links When fetch populates the list Then initialization waits for the complete list", async (t) => {
  const gate = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    `${profileHtml.replace("<button>expand_more</button>", "")}<script>fetch('/fixture/solved').then(r=>r.text()).then(html=>document.querySelector('.problem-list').innerHTML=html)</script>`,
    new Map([["/fixture/solved", gate]]),
  );
  await page.goto(settings.baseUrl);
  const operation = tracked(
    new AccountProfileCollector(settings, requests).collectSolved(page),
  );
  await gate.requested;
  await page.evaluate(() => document.readyState);
  const premature = operation.settled();
  gate.release(
    '<a href="/problem/1">1</a><a href="/problem/2">2</a><a href="/problem/3">3</a>',
  );
  const result = await operation.result;
  assert.equal(premature, false);
  assert.ok(result.ok);
  assert.deepEqual(result.value, [1, 2, 3]);
});
