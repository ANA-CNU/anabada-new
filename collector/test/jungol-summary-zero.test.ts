import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium } from "playwright";
import { AccountSyncPlan, rankMemberSchema } from "../src/domain/sync.js";
import { AccountSummaryCollector } from "../src/jungol/account-summary.js";
import { JungolError } from "../src/jungol/errors.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

const plan = (solvedCount: number) =>
  new AccountSyncPlan(
    "initial_summary",
    rankMemberSchema.parse({
      accountId: "42",
      jungolName: "member",
      solvedCount,
      wrongCount: 0,
      acRating: 0,
      tier: 0,
    }),
    0n,
    solvedCount,
    1,
  );

test("Given an observed zero solved count without a solved-list card When collecting a zero-rank baseline Then only that explicit empty state succeeds", async (t) => {
  const responses = [
    {
      status: 200,
      body: '<main><div><span>맞은 문제</span><strong>0문제</strong></div><section class="card"><p>틀린 문제</p><div class="problem-list"><a href="/problem/999">999</a></div></section></main>',
    },
    {
      status: 200,
      body: "<main><div><span>맞은 문제</span><strong>0문제</strong></div></main>",
    },
    { status: 200, body: "<main></main>" },
    { status: 200, body: "<main>CAPTCHA challenge</main>" },
    {
      status: 403,
      body: "<main><div><span>맞은 문제</span><strong>0문제</strong></div></main>",
    },
  ];
  const server = createServer((_request, response) => {
    const next = responses.shift();
    assert.ok(next);
    response.statusCode = next.status;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(next.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  t.after(() => page.close());
  const collector = new AccountSummaryCollector(
    { baseUrl: `http://127.0.0.1:${address.port}`, pageTimeoutMs: 100 },
    new JungolRequestCoordinator({ delay: async () => {} }),
  );

  assert.deepEqual(await collector.collect(page, plan(0)), []);
  await assert.rejects(collector.collect(page, plan(1)), {
    code: "account_summary_mismatch",
  });
  await assert.rejects(collector.collect(page, plan(0)), {
    code: "account_summary_invalid",
  });
  await assert.rejects(collector.collect(page, plan(0)), {
    code: "manual_recovery_required",
  });
  await assert.rejects(collector.collect(page, plan(0)), {
    code: "account_summary_http_failed",
  });
});

test("Given timeout snapshots When collecting Then diagnostics stay scoped, nonwaiting, and numeric only", async (t) => {
  const responses = [
    '<main><section class="card"><p>틀린 문제</p><div class="problem-list"><a href="/problem/999">999</a></div></section></main>',
    '<main><div><span>맞은 문제</span><strong>1,234문제</strong></div><section class="card"><p>check해결한 문제</p><div class="problem-list"><a href="/problem/1">1</a></div></section><section class="card"><p>틀린 문제</p><div class="problem-list"><a href="/problem/999">999</a></div></section></main>',
    '<main><div><span>맞은 문제</span><strong>2문제</strong></div><section class="card"><p>해결한 문제</p><div class="problem-list"><a href="/problem/1">1</a></div></section><section class="card"><p>check해결한 문제</p><div class="problem-list"><a href="/problem/2">2</a></div></section></main>',
  ];
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(responses.shift());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  t.after(() => page.close());
  const collector = new AccountSummaryCollector(
    { baseUrl: `http://127.0.0.1:${address.port}`, pageTimeoutMs: 100 },
    new JungolRequestCoordinator({ delay: async () => {} }),
  );

  await assert.rejects(collector.collect(page, plan(1)), (error: unknown) => {
    assert.ok(error instanceof JungolError);
    assert.deepEqual(error.diagnostics, {
      stage: "account_summary_readiness",
      reason: "timeout",
      rankSolvedCount: 1,
      expectedCount: 1,
      timeoutMs: 100,
    });
    return true;
  });
  await assert.rejects(
    collector.collect(page, plan(1234)),
    (error: unknown) => {
      assert.ok(error instanceof JungolError);
      assert.deepEqual(error.diagnostics, {
        stage: "account_summary_readiness",
        reason: "timeout",
        rankSolvedCount: 1234,
        profileSolvedCount: 1234,
        observedLinkCount: 1,
        distinctLinkCount: 1,
        expectedCount: 1234,
        timeoutMs: 100,
      });
      return true;
    },
  );
  await assert.rejects(collector.collect(page, plan(2)), (error: unknown) => {
    assert.ok(error instanceof JungolError);
    assert.deepEqual(error.diagnostics, {
      stage: "account_summary_readiness",
      reason: "timeout",
      rankSolvedCount: 2,
      profileSolvedCount: 2,
      expectedCount: 2,
      timeoutMs: 100,
    });
    return true;
  });
});
