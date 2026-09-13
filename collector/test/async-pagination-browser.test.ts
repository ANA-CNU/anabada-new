import assert from "node:assert/strict";
import test from "node:test";
import { rankMemberSchema } from "../src/domain/sync.js";
import { GroupFeedCollector } from "../src/jungol/group-feed.js";
import { asyncBrowserFixture } from "./async-browser-fixture.js";

const member = rankMemberSchema.parse({
  accountId: "42",
  jungolName: "member",
  solvedCount: 1,
  wrongCount: 0,
  acRating: 20,
  tier: 1,
});

const row = (id: number, timestamp: string) =>
  `<tr><td>${id}</td><td><a href="/account/42">member</a></td><td><a href="/problem/1000">1000</a></td><td>정답 100점</td><td>1ms</td><td>1KB</td><td>1</td><td>C++</td><td><a href="?result=AC&sid=${id}"><div role="button" tabindex="0" onmouseenter="const t=document.createElement('span');t.id='tooltip';t.textContent='${timestamp}';document.body.append(t)" onmouseleave="document.querySelector('#tooltip')?.remove()">오전 1:00</div></a></td></tr>`;

const table = (rows: string) =>
  `<table><thead><tr><th>번호</th><th>제출자</th><th>문제</th><th>결과</th><th>시간</th><th>메모리</th><th>길이</th><th>언어</th><th>시각</th></tr></thead><tbody>${rows}</tbody></table>`;

const delayedPage = (delay: number) => {
  const first = row(9, "2026. 9. 13. 오전 1:00:01");
  const second = row(8, "2026. 9. 12. 오후 1:00:02");
  return `<main></main><script>setTimeout(()=>{document.querySelector('main').innerHTML=${JSON.stringify(`${table(first)}<button id="more">더 불러오기</button>`)};document.querySelector('#more').addEventListener('click',()=>{document.querySelector('tbody').insertAdjacentHTML('beforeend',${JSON.stringify(second)});document.querySelector('#more').remove()})},${delay})</script>`;
};

test("Given delayed DOM rows and load-more When the production feed reads pages Then it waits and returns only new older rows", async (t) => {
  const html = delayedPage(100);
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    html,
    new Map(),
  );
  const collector = new GroupFeedCollector(settings, requests);

  const first = await collector.readPage(page, [member], {
    lastScannedSubmissionId: null,
  });
  assert.deepEqual(
    first.submissions.map((submission) => submission.submissionId),
    ["9"],
  );
  const second = await collector.readPage(page, [member], {
    lastScannedSubmissionId: "9",
  });
  assert.deepEqual(
    second.submissions.map((submission) => submission.submissionId),
    ["8"],
  );
  assert.equal(second.more, false);
});

test("Given a fresh page and persisted marker When the production feed restarts Then it replays to the marker before returning older rows", async (t) => {
  const html = delayedPage(0);
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    html,
    new Map(),
  );
  const result = await new GroupFeedCollector(settings, requests).readPage(
    page,
    [member],
    { lastScannedSubmissionId: "9" },
  );
  assert.deepEqual(
    result.submissions.map((submission) => submission.submissionId),
    ["8"],
  );
});
