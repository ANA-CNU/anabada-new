import assert from "node:assert/strict";
import { serialize } from "bson";
import { GroupRuntimeBrowser } from "../src/application/group-runtime-browser.js";
import { problemIdSchema } from "../src/domain.js";
import { GroupFeedCollector } from "../src/jungol/group-feed.js";
import { ProblemMetadataResolver } from "../src/jungol/metadata.js";
import { AccountProfileCollector } from "../src/jungol/profile.js";
import { RankCollector } from "../src/jungol/rank.js";
import {
  asyncBrowserFixture,
  FetchGate,
  rankHtml,
  rankRow,
  browserTest as test,
  tracked,
} from "./async-browser-fixture.js";

test("Given all real runtime browser adapters When rank, profile, feed and problem hydrate asynchronously Then initialization carries fetched data end to end", async (t) => {
  const rank = new FetchGate();
  const profile = new FetchGate();
  const feed = new FetchGate();
  const metadata = new FetchGate();
  const pages = new Map([
    [
      "/group/1125/rank",
      `${rankHtml}<script>fetch('/fixture/rank').then(r=>r.text()).then(html=>document.querySelector('tbody').innerHTML=html)</script>`,
    ],
    [
      "/account/42",
      `<main></main><script>fetch('/fixture/profile').then(r=>r.text()).then(html=>document.querySelector('main').innerHTML=html)</script>`,
    ],
    [
      "/group/1125/submission",
      `<table><thead><tr><th>번호</th></tr></thead><tbody></tbody></table><script>fetch('/api/group/1125/submission?result=AC',{headers:{'x-fp':'aa'}}).then(r=>r.arrayBuffer()).then(()=>document.querySelector('tbody').innerHTML='<tr><td>12</td></tr>')</script>`,
    ],
    [
      "/problem/1000",
      `<main></main><script>fetch('/fixture/metadata').then(r=>r.text()).then(html=>document.querySelector('main').innerHTML=html)</script>`,
    ],
  ]);
  const { browser, settings, requests } = await asyncBrowserFixture(
    t,
    pages,
    new Map([
      ["/fixture/rank", rank],
      ["/fixture/profile", profile],
      ["/api/group/1125/submission", feed],
      ["/fixture/metadata", metadata],
    ]),
  );
  const runtime = new GroupRuntimeBrowser({
    ...settings,
    groupId: 1125,
    requests,
    newPage: () => browser.newPage(),
    rank: new RankCollector(settings, requests),
    feed: new GroupFeedCollector(settings, requests),
    profile: new AccountProfileCollector(settings, requests),
    metadata: new ProblemMetadataResolver(settings, requests),
  });
  t.after(() => runtime.close());
  const signal = new AbortController().signal;
  const membersOperation = tracked(runtime.members(signal));
  await rank.requested;
  rank.release(rankRow);
  const members = await membersOperation.result;
  assert.ok(members.ok);
  const member = members.value[0];
  assert.ok(member);
  const initialization = tracked(runtime.initialize(member, signal));
  await profile.requested;
  assert.equal(initialization.settled(), false);
  profile.release(
    '<div><span>맞은 문제</span>1문제</div><section class="card"><h2>check 해결한 문제</h2><div class="problem-list"><a href="/problem/1000">1000</a></div></section>',
  );
  await feed.requested;
  feed.release(
    serialize({
      data: {
        list: [
          { id: 12, p: 1000, u: "member", r: "AC", s: 100, t: 1788608362887 },
        ],
        paging: { cursor: "end", more: false },
      },
    }).map((byte) => byte ^ 0xaa),
  );
  const initialized = await initialization.result;
  assert.ok(initialized.ok);
  assert.equal(initialized.value.member.acRating, 800);
  assert.equal(initialized.value.member.tier, 11);
  assert.deepEqual(
    initialized.value.solved.map((row) => row.problemId),
    [1000],
  );
  assert.equal(initialized.value.highestInspectedSubmissionId, 12n);
  const problem = tracked(
    runtime.readMetadata(problemIdSchema.parse(1000), signal),
  );
  await metadata.requested;
  assert.equal(problem.settled(), false);
  metadata.release(
    '<h1 data-problem-title>Fetched title</h1><span data-tier="15"></span>',
  );
  const resolved = await problem.result;
  assert.ok(resolved.ok);
  assert.equal(resolved.value.tier, 15);
});
