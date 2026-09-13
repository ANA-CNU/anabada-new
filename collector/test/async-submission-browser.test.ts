import assert from "node:assert/strict";
import { serialize } from "bson";
import { AccountSyncPlan, rankMemberSchema } from "../src/domain/sync.js";
import { GroupFeedCollector } from "../src/jungol/group-feed.js";
import { SubmissionCollector } from "../src/jungol/submission.js";
import { SubmissionCursorCollector } from "../src/jungol/submission-cursor.js";
import {
  asyncBrowserFixture,
  FetchGate,
  browserTest as test,
  tracked,
} from "./async-browser-fixture.js";

const member = rankMemberSchema.parse({
  accountId: "42",
  jungolName: "member",
  solvedCount: 1,
  wrongCount: 0,
  acRating: 800,
  tier: 11,
});
const wire = (ids: readonly number[], more = false) =>
  serialize({
    data: {
      list: ids.map((id) => ({
        id,
        p: 1000,
        r: "AC",
        s: 100,
        u: "member",
        t: 1788608362887,
      })),
      paging: { cursor: more ? "next-page" : "end", more },
    },
  }).map((byte) => byte ^ 0xaa);

test("Given a page whose JS fetch starts after load When group API and DOM are separately delayed Then the production collector waits for both", async (t) => {
  // Given
  const bootstrap = new FetchGate();
  const api = new FetchGate();
  const render = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    `<main></main><script>fetch('/fixture/bootstrap').then(()=>fetch('/api/group/1125/submission?result=AC',{headers:{'x-fp':'aa'}})).then(r=>r.arrayBuffer()).then(()=>fetch('/fixture/render')).then(r=>r.text()).then(html=>document.querySelector('main').innerHTML=html)</script>`,
    new Map([
      ["/fixture/bootstrap", bootstrap],
      ["/api/group/1125/submission", api],
      ["/fixture/render", render],
    ]),
  );
  const operation = tracked(
    new GroupFeedCollector(settings, requests).readPage(page, [member], null),
  );
  // When
  await bootstrap.requested;
  await page.waitForLoadState("load");
  assert.equal(operation.settled(), false);
  bootstrap.release("");
  await api.requested;
  assert.equal(operation.settled(), false);
  api.release(wire([12, 11]));
  await render.requested;
  assert.equal(
    operation.settled(),
    false,
    JSON.stringify(
      await Promise.race([operation.result, Promise.resolve("pending")]),
    ),
  );
  render.release(
    "<table><tr><th>번호</th></tr><tr><td>12 +1</td></tr></table>",
  );
  const result = await operation.result;
  // Then: DOM 그룹 행이 아니라 두 원본 제출을 모두 보존한다.
  assert.ok(result.ok, result.ok ? "" : String(result.error));
  assert.deepEqual(
    result.value.submissions.map((row) => row.submissionId),
    ["12", "11"],
  );
  assert.equal(
    result.value.submissions[0]?.submittedAt.toISOString(),
    "2026-09-05T11:39:22.887Z",
  );
});

test("Given an empty AC response arriving after JS When the page has headers only Then empty is accepted only after the real response", async (t) => {
  const api = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    `<table><thead><tr><th scope="col">번호</th></tr></thead></table><script>fetch('/api/group/1125/submission?result=AC',{headers:{'x-fp':'aa'}})</script>`,
    new Map([["/api/group/1125/submission", api]]),
  );
  const operation = tracked(
    new GroupFeedCollector(settings, requests).readPage(page, [member], null),
  );
  await api.requested;
  await page.waitForLoadState("load");
  assert.equal(operation.settled(), false);
  api.release(wire([]));
  const result = await operation.result;
  assert.ok(result.ok, result.ok ? "" : String(result.error));
  assert.deepEqual(result.value, {
    submissions: [],
    nextCursor: null,
    more: false,
  });
});

test("Given an API that never completes When the operation is aborted Then no empty feed is returned", async (t) => {
  const api = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    `<table><tr><th>번호</th></tr></table><script>fetch('/api/group/1125/submission?result=AC')</script>`,
    new Map([["/api/group/1125/submission", api]]),
  );
  const abort = new AbortController();
  const operation = tracked(
    new GroupFeedCollector(settings, requests).readPage(
      page,
      [member],
      null,
      abort.signal,
    ),
  );
  await api.requested;
  abort.abort();
  const result = await operation.result;
  assert.equal(result.ok, false);
  if (!result.ok)
    assert.equal(Reflect.get(Object(result.error), "code"), "cancelled");
});

for (const mode of ["incremental", "initial_summary"] as const) {
  test(`Given delayed personal submission fetch When ${mode} runs Then the real legacy adapter reads wire data after load`, async (t) => {
    const api = new FetchGate();
    const { page, settings, requests } = await asyncBrowserFixture(
      t,
      `<main>로딩 중</main><script>fetch('/api/submission',{headers:{'x-fp':'aa'}})</script>`,
      new Map([["/api/submission", api]]),
    );
    const plan = new AccountSyncPlan(mode, member, 0n, 1, 1);
    const operation = tracked(
      mode === "incremental"
        ? new SubmissionCollector(settings, requests)
            .collect(page, plan)
            .then((result) => result.highestInspectedId)
        : new SubmissionCursorCollector(settings, requests)
            .collect(page, plan)
            .then((result) => result.highestInspectedSubmissionId),
    );
    await api.requested;
    await page.waitForLoadState("load");
    assert.equal(operation.settled(), false);
    api.release(wire([12, 11]));
    const result = await operation.result;
    assert.ok(result.ok, result.ok ? "" : String(result.error));
    assert.equal(result.value, 12n);
  });
}
