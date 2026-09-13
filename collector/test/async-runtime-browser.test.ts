import assert from "node:assert/strict";
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
      `<style>.timestamp { display: none; } [role="button"]:hover + .timestamp { display: inline; }</style><table><thead><tr><th>번호</th><th>제출자</th><th>문제</th><th>결과</th><th>시간</th><th>메모리</th><th>길이</th><th>언어</th><th>시각</th></tr></thead><tbody></tbody></table><script>fetch('/fixture/feed').then(r=>r.text()).then(html=>document.querySelector('tbody').innerHTML=html)</script>`,
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
      ["/fixture/feed", feed],
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
    '<tr><td>1</td><td><a href="/account/42">member</a></td><td><a href="/problem/1000">1000</a></td><td>정답 100점</td><td>1ms</td><td>1KB</td><td>1</td><td>C++</td><td><a href="/group/1125/submission?result=AC&sid=12">12</a><div role="button" tabindex="0">오전 1:00</div><span class="timestamp">2026. 9. 13. 오전 1:00:01</span></td></tr>',
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
