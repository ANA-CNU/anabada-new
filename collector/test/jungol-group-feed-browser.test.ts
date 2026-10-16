import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { type Browser, chromium } from "playwright";
import { groupMemberSchema } from "../src/domain/sync.js";
import { GroupFeedCollector } from "../src/jungol/group-feed.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

const member = groupMemberSchema.parse({
  accountId: "42",
  jungolName: "member",
  tier: 1,
});
const row = (
  id: number,
  problem: number,
  timestamp: string,
  submissionLinkInLanguageCell: boolean = false,
) => {
  const submissionLink = `<a href="?result=AC&sid=${id}">${id}</a>`;
  return `<tr><td>${10 - id}</td><td><a href="/account/42">member</a></td><td><a href="/problem/${problem}">${problem}</a></td><td>정답 100점</td><td>1ms</td><td>1MB</td><td>10</td><td>C++${submissionLinkInLanguageCell ? submissionLink : ""}</td><td>${submissionLinkInLanguageCell ? "" : submissionLink}<div role="button" tabindex="0">시각</div><span class="timestamp">${timestamp}</span></td></tr>`;
};
const firstRow = row(9, 1339, "2026.9.13.오후7:37:16", true);
const pendingFirstRow = firstRow.replace(
  '<a href="/account/42">member</a>',
  '<span class="account-placeholder">member</span>',
);
const nextRow = row(8, 1000, "2026.9.13.오후7:36:16");
const structuralRows = '<tr><td colspan="9"></td></tr>'.repeat(3);

test("Given a delayed DOM feed When a new collector resumes on its existing page Then it pages after the marker without navigating again", async (t) => {
  // Given
  let navigations = 0;
  let directAcceptedNavigations = 0;
  const server = createServer((request, response) => {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "127.0.0.1"}`,
    );
    if (url.pathname !== "/group/1125/submission") {
      response.statusCode = 404;
      response.end();
      return;
    }
    if (url.searchParams.get("result") === "AC") {
      directAcceptedNavigations += 1;
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(
        "<main><h1>문제가 발생했어요</h1><p>알 수 없는 오류</p></main>",
      );
      return;
    }
    navigations += 1;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      `<!doctype html><style>.timestamp { display: none; position: absolute; } [role="button"]:hover + .timestamp { display: inline; }</style><button type="button" id="result">결과</button><div id="options" hidden><button role="option" data-value="0\u001fAC">정답</button></div><table><thead><tr><th>번호</th><th>제출자</th><th>문제</th><th>결과</th><th>시간</th><th>메모리</th><th>코드 길이</th><th>언어</th><th>시각</th></tr></thead><tbody></tbody></table><button type="button" id="more">더 불러오기</button><script>document.querySelector('#result').addEventListener('click', () => document.querySelector('#options').hidden = false); document.querySelector('[role=option]').addEventListener('click', () => { history.pushState({}, '', '?result=AC'); setTimeout(() => { document.querySelector('tbody').insertAdjacentHTML('beforeend', ${JSON.stringify(pendingFirstRow + structuralRows)}); setTimeout(() => document.querySelector('.account-placeholder').replaceWith(Object.assign(document.createElement('a'), { href: '/account/42', textContent: 'member' })), 25); }, 25); }); document.querySelector('#more').addEventListener('click', () => setTimeout(() => { document.querySelector('tbody').insertAdjacentHTML('beforeend', ${JSON.stringify(nextRow)}); document.querySelector('#more').remove(); }, 25));</script>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser: Browser | undefined;
  t.after(async () => {
    try {
      await browser?.close();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  const page = await browser.newPage();
  const settings = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    pageTimeoutMs: 1_000,
  };
  const requests = new JungolRequestCoordinator({ delay: async () => {} });
  const first = await new GroupFeedCollector(settings, requests).readPage(
    page,
    [member],
    { lastScannedSubmissionId: null },
  );
  const resumedCollector = new GroupFeedCollector(settings, requests);

  // When
  const resumed = await resumedCollector.readPage(page, [member], {
    lastScannedSubmissionId: "9",
  });

  // Then
  assert.equal(navigations, 1);
  assert.equal(directAcceptedNavigations, 0);
  assert.equal(new URL(page.url()).searchParams.get("result"), "AC");
  assert.deepEqual(
    first.submissions.map((submission) => submission.submissionId),
    ["9"],
  );
  assert.equal(first.more, true);
  assert.deepEqual(
    resumed.submissions.map((submission) => submission.submissionId),
    ["8"],
  );
  assert.equal(resumed.more, false);

  const freshPage = await browser.newPage();
  const fresh = await new GroupFeedCollector(settings, requests).readPage(
    freshPage,
    [member],
    { lastScannedSubmissionId: "9" },
  );
  assert.deepEqual(
    fresh.submissions.map((submission) => submission.submissionId),
    ["8"],
  );

  await assert.rejects(
    new GroupFeedCollector(settings, requests).readPage(freshPage, [member], {
      lastScannedSubmissionId: "7",
    }),
    { code: "group_feed_cursor_not_found" },
  );
});

test("Given the current responsive submission layout When reading and resuming its existing page Then the 시각 column drives timestamps", async (t) => {
  const currentRow = (id: number, timestamp: string) =>
    `<tr><td>${id}</td><td><a href="/account/42">member</a></td><td><a href="/problem/1000">1000</a></td><td>정답 100점</td><td>1ms</td><td>1MB</td><td><a href="?result=AC&sid=${id}">Java</a></td><td><div role="button" tabindex="0">시각</div><span class="timestamp">${timestamp}</span></td><td>번호 · 코드 길이</td></tr>`;
  let navigations = 0;
  const server = createServer((request, response) => {
    if (
      new URL(request.url ?? "/", "http://127.0.0.1").pathname ===
      "/group/1125/submission"
    )
      navigations += 1;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      `<!doctype html><style>.timestamp{display:none}[role=button]:hover + .timestamp{display:inline}</style><button id="result">결과</button><button role="option">정답</button><table><thead><tr><th>번호</th><th>제출자</th><th>문제</th><th>결과</th><th>시간</th><th>메모리</th><th>언어</th><th>시각</th><th>번호 · 코드 길이</th></tr></thead><tbody>${currentRow(9, "2026. 10. 8. 오후 5:26:34")}${currentRow(8, "2026. 10. 8. 오후 5:25:34")}</tbody></table><script>document.querySelector('[role=option]').onclick=()=>history.pushState({},'', '?result=AC')</script>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  t.after(async () => {
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const page = await browser.newPage();
  const collector = new GroupFeedCollector(
    { baseUrl: `http://127.0.0.1:${address.port}`, pageTimeoutMs: 1_000 },
    new JungolRequestCoordinator({ delay: async () => {} }),
  );
  const first = await collector.readPage(page, [member], {
    lastScannedSubmissionId: null,
  });
  const resumed = await collector.readPage(page, [member], {
    lastScannedSubmissionId: "9",
  });
  assert.deepEqual(
    first.submissions.map((submission) => submission.submissionId),
    ["9", "8"],
  );
  assert.deepEqual(
    resumed.submissions.map((submission) => submission.submissionId),
    ["8"],
  );
  assert.equal(navigations, 1);
  assert.equal(
    first.submissions[0]?.submittedAt.toISOString(),
    "2026-10-08T08:26:34.000Z",
  );
});
