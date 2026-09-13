import assert from "node:assert/strict";
import { serialize } from "bson";
import { rankMemberSchema } from "../src/domain/sync.js";
import { GroupFeedCollector } from "../src/jungol/group-feed.js";
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
  acRating: 0,
  tier: 0,
});
const wire = (id: number, more: boolean) =>
  serialize({
    data: {
      list: [{ id, p: 1000, r: "AC", u: "member", s: 100, t: 1788608362887 }],
      paging: { cursor: "next-page", more },
    },
  }).map((byte) => byte ^ 0xaa);
const html = `<table><thead><tr><th scope="col">번호</th></tr></thead><tbody><tr><td>9</td></tr></tbody></table><button onclick="fetch('/api/group/1125/submission?result=AC&cursor=next-page',{headers:{'x-fp':'aa'}}).then(r=>r.arrayBuffer())">더 불러오기</button><script>fetch('/api/group/1125/submission?result=AC',{headers:{'x-fp':'aa'}}).then(r=>r.arrayBuffer())</script>`;

test("Given a delayed load-more response When the actual group collector paginates Then it waits and reads the matching cursor once", async (t) => {
  const firstGate = new FetchGate();
  const nextGate = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    html,
    new Map([
      ["/api/group/1125/submission?result=AC", firstGate],
      ["/api/group/1125/submission?result=AC&cursor=next-page", nextGate],
    ]),
  );
  const collector = new GroupFeedCollector(settings, requests);
  const first = tracked(collector.readPage(page, [member], null));
  await firstGate.requested;
  firstGate.release(wire(9, true));
  const firstResult = await first.result;
  assert.ok(firstResult.ok);
  const next = tracked(
    collector.readPage(page, [member], firstResult.value.nextCursor),
  );
  await nextGate.requested;
  assert.equal(next.settled(), false);
  nextGate.release(wire(8, false));
  const nextResult = await next.result;
  assert.ok(nextResult.ok);
  assert.equal(nextResult.value.submissions[0]?.submissionId, "8");
  assert.equal(nextResult.value.more, false);
});

test("Given response headers before the BSON body When the collector observes HTTP 200 Then it still waits for complete bytes", async (t) => {
  const gate = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    html,
    new Map([["/api/group/1125/submission", gate]]),
  );
  const headers = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/group/1125/submission",
  );
  const operation = tracked(
    new GroupFeedCollector(settings, requests).readPage(page, [member], null),
  );
  await gate.requested;
  gate.sendHeaders();
  await headers;
  assert.equal(operation.settled(), false);
  gate.release(wire(9, false));
  const result = await operation.result;
  assert.ok(result.ok);
  assert.equal(result.value.submissions[0]?.submissionId, "9");
});
