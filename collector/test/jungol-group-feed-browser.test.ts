import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { type Browser, chromium } from "playwright";
import { rankMemberSchema } from "../src/domain/sync.js";
import { GroupFeedCollector } from "../src/jungol/group-feed.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

const member = rankMemberSchema.parse({
  accountId: "42",
  jungolName: "member",
  solvedCount: 1,
  wrongCount: 0,
  acRating: 30,
  tier: 1,
});
const row = (id: number, problem: number, timestamp: string) =>
  `<tr><td>${10 - id}</td><td><a href="/account/42">member</a></td><td><a href="/problem/${problem}">${problem}</a></td><td>정답 100점</td><td>1ms</td><td>1MB</td><td>10</td><td>C++</td><td><a href="/submission?sid=${id}">${id}</a><div role="button" tabindex="0">시각</div><span class="timestamp">${timestamp}</span></td></tr>`;
const firstRow = row(9, 1339, "2026.9.13.오후7:37:16");
const pendingFirstRow = firstRow.replace(
  '<a href="/account/42">member</a>',
  '<span class="account-placeholder">member</span>',
);
const nextRow = row(8, 1000, "2026.9.13.오후7:36:16");
const structuralRows = '<tr><td colspan="9"></td></tr>'.repeat(3);

test("Given a delayed DOM feed When a new collector resumes on its existing page Then it pages after the marker without navigating again", async (t) => {
  // Given
  let navigations = 0;
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
    navigations += 1;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      `<!doctype html><style>.timestamp { display: none; position: absolute; } [role="button"]:hover + .timestamp { display: inline; }</style><table><thead><tr><th>번호</th><th>제출자</th><th>문제</th><th>결과</th><th>시간</th><th>메모리</th><th>길이</th><th>언어</th><th>시각</th></tr></thead><tbody></tbody></table><button type="button" id="more">더 불러오기</button><script>setTimeout(() => { document.querySelector('tbody').insertAdjacentHTML('beforeend', ${JSON.stringify(pendingFirstRow + structuralRows)}); setTimeout(() => document.querySelector('.account-placeholder').replaceWith(Object.assign(document.createElement('a'), { href: '/account/42', textContent: 'member' })), 25); }, 25); document.querySelector('#more').addEventListener('click', () => setTimeout(() => { document.querySelector('tbody').insertAdjacentHTML('beforeend', ${JSON.stringify(nextRow)}); document.querySelector('#more').remove(); }, 25));</script>`,
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
