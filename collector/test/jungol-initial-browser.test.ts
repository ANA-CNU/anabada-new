import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { serialize } from "bson";
import { chromium } from "playwright";
import { AccountSyncPlan, rankMemberSchema } from "../src/domain/sync.js";
import { AccountSummaryCollector } from "../src/jungol/account-summary.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";
import { SubmissionCursorCollector } from "../src/jungol/submission-cursor.js";

const member = (solvedCount: number) =>
  rankMemberSchema.parse({
    accountId: "42",
    jungolName: "member",
    solvedCount,
    wrongCount: 0,
    acRating: 0,
    tier: 0,
  });
const plan = (solvedCount: number) =>
  new AccountSyncPlan(
    "initial_summary",
    member(solvedCount),
    0n,
    solvedCount,
    1,
  );
const account = (matched: string, links: string) =>
  `<main><div><span>맞은 문제</span><strong>${matched}</strong></div><section><p>해결한 문제</p><div><div>${links}</div></div><p>틀린 문제</p><div><a href="/problem/999" role="button">999</a></div></section><a href="/problem/888">888</a></main>`;
const wire = (ids: readonly number[], more = false) =>
  Buffer.from(
    serialize({
      data: {
        list: ids.map((id, index) => ({
          id,
          p: 1000,
          r: index === 0 ? "WA" : "AC",
          t: 1,
        })),
        paging: { cursor: "cursor", more },
      },
    }).map((byte) => byte ^ 0xaa),
  );

test("Given local Jungol pages When collecting initial boundaries Then only validated sections and first API page are used", async (t) => {
  let accountBody = account(
    "2문제",
    '<div><a href="/problem/100">100</a></div><div><a href="/problem/200">200</a></div>',
  );
  let accountStatus = 200;
  let submissionBody = wire([12, 11], true);
  let submissionStatus = 200;
  let apiCalls = 0;
  let accountCalls = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/api/submission") {
      apiCalls++;
      response.statusCode = submissionStatus;
      response.setHeader("x-fp", "aa");
      response.end(submissionBody);
      return;
    }
    accountCalls++;
    response.statusCode = accountStatus;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      url.pathname.endsWith("/submission")
        ? '<button>더 불러오기</button><script>fetch("/api/submission", {headers:{"x-fp":"aa"}})</script>'
        : accountBody,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const settings = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    pageTimeoutMs: 3000,
  };
  const coordinator = new JungolRequestCoordinator({ delay: async () => {} });
  const summary = new AccountSummaryCollector(settings, coordinator);
  const cursor = new SubmissionCursorCollector(settings, coordinator);
  const page = await browser.newPage();
  t.after(() => page.close());

  const invalidPlan = new AccountSyncPlan("incremental", member(2), 0n, 2, 1);
  await assert.rejects(summary.collect(page, invalidPlan), {
    code: "invalid_plan",
  });
  await assert.rejects(cursor.collect(page, invalidPlan), {
    code: "invalid_plan",
  });
  assert.equal(accountCalls, 0);
  assert.equal(apiCalls, 0);

  const solved = await summary.collect(page, plan(2));
  assert.deepEqual(
    solved.map((item) => item.problemId),
    [100, 200],
  );
  const firstCursor = await cursor.collect(page, plan(2));
  assert.equal(firstCursor.highestInspectedSubmissionId, 12n);
  assert.equal(firstCursor.scannedAttemptCount, 2);
  assert.equal(apiCalls, 1);

  for (const body of [
    account(
      "2문제",
      '<a href="/problem/100">100</a><a href="/problem/100">100</a>',
    ),
    account(
      "2문제",
      '<a href="/problem/nope">nope</a><a href="/problem/200">200</a>',
    ),
    "<main>구조 변경</main>",
    account(
      "1문제",
      '<a href="/problem/100">100</a><a href="/problem/200">200</a>',
    ),
    account(
      "1,,2문제",
      '<a href="/problem/100">100</a><a href="/problem/200">200</a>',
    ),
    account(
      "12,34문제",
      '<a href="/problem/100">100</a><a href="/problem/200">200</a>',
    ),
  ]) {
    accountBody = body;
    await assert.rejects(summary.collect(page, plan(2)));
  }
  accountBody = "<main>CAPTCHA challenge</main>";
  await assert.rejects(summary.collect(page, plan(2)), {
    code: "manual_recovery_required",
  });
  accountBody = "<main><button>로그인</button></main>";
  await assert.rejects(summary.collect(page, plan(2)), {
    code: "auth_required",
  });
  accountBody = account("0문제", "");
  assert.deepEqual(await summary.collect(page, plan(0)), []);
  accountBody = account(
    "1,234문제",
    Array.from(
      { length: 1234 },
      (_, index) => `<a href="/problem/${index + 1}">${index + 1}</a>`,
    ).join(""),
  );
  assert.equal((await summary.collect(page, plan(1234))).length, 1234);
  for (const status of [403, 429]) {
    accountStatus = status;
    await assert.rejects(summary.collect(page, plan(0)), {
      code: "account_summary_http_failed",
    });
  }
  accountStatus = 200;
  submissionBody = wire([], false);
  await assert.rejects(cursor.collect(page, plan(1)), {
    code: "submission_cursor_stale",
  });
  const zeroCursor = await cursor.collect(page, plan(0));
  assert.equal(zeroCursor.highestInspectedSubmissionId, 0n);
  assert.equal(zeroCursor.scannedAttemptCount, 0);
  submissionBody = wire([10, 11]);
  await assert.rejects(cursor.collect(page, plan(1)), {
    code: "submission_order_invalid",
  });
  submissionBody = Buffer.from("malformed");
  await assert.rejects(cursor.collect(page, plan(1)), { code: "invalid_bson" });
  for (const status of [403, 429]) {
    submissionStatus = status;
    await assert.rejects(cursor.collect(page, plan(1)), {
      code: "submission_http_failed",
    });
  }
});
