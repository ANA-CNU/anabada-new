import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { serialize } from "bson";
import { chromium } from "playwright";
import { AccountSyncPlan, rankMemberSchema } from "../src/domain/sync.js";
import { problemIdSchema } from "../src/domain.js";
import { ProblemMetadataResolver } from "../src/jungol/metadata.js";
import { RankCollector } from "../src/jungol/rank.js";
import { SubmissionCollector } from "../src/jungol/submission.js";

test("Given a local Jungol fixture When browsing Then rank, raw pagination and fallback are observed", async (t) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/api/submission") {
      const second = url.searchParams.has("next");
      const list = (second ? [8] : [10, 9]).map((id) => ({
        id,
        p: 1339,
        r: id === 9 ? "WA" : "AC",
        a: "JAVA",
        t: 1788608362887,
      }));
      const bytes = serialize({
        data: { list, paging: { cursor: second ? "8" : "9", more: !second } },
      });
      response.end(bytes.map((byte) => byte ^ 0xaa));
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (url.pathname.endsWith("/rank")) {
      response.end(
        '<table><tr><th>등수</th><th>계정</th><th>푼 문제</th><th>틀린 문제</th><th>스트릭</th><th>AC 레이팅</th></tr><tr><td>1</td><td><a href="/account/42">member</a></td><td>1,234문제</td><td>2문제</td><td>0일</td><td>45</td></tr></table>',
      );
      return;
    }
    if (url.pathname.endsWith("/submission")) {
      response.end(
        '<button onclick="fetch(\'/api/submission?next=1\',{headers:{\'x-fp\':\'aa\'}})">더 불러오기</button><script>fetch("/api/submission",{headers:{"x-fp":"aa"}})</script>',
      );
      return;
    }
    response.end("<main>unavailable metadata</main>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const settings = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    pageTimeoutMs: 3000,
    requestDelayMs: 0,
  };
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  try {
    const page = await browser.newPage();
    const members = await new RankCollector(settings).collect(page, 1125);
    assert.equal(members[0]?.solvedCount, 1234);
    assert.equal(members[0]?.acRating, 45);
    assert.equal(members[0]?.tier, 1);
    const member = rankMemberSchema.parse({
      accountId: "42",
      jungolName: "member",
      solvedCount: 1234,
      wrongCount: 2,
      acRating: 45,
      tier: 1,
    });
    const plan = (cursorBefore: bigint, maxPages: number) =>
      new AccountSyncPlan(
        cursorBefore === 0n ? "initial_backfill" : "incremental",
        member,
        cursorBefore,
        cursorBefore === 0n ? member.solvedCount : 1,
        maxPages,
      );
    const collector = new SubmissionCollector(settings);
    const result = await collector.collect(page, plan(0n, 2));
    assert.deepEqual(
      result.attempts.map((attempt) => attempt.verdict),
      ["accepted", "wrong_answer", "accepted"],
    );
    assert.equal(result.highestInspectedId, 10n);
    assert.equal(result.pageCount, 2);
    await assert.rejects(collector.collect(page, plan(0n, 1)), {
      code: "max_pages_reached_before_cursor",
    });
    const cursorResult = await collector.collect(page, plan(9n, 1));
    assert.deepEqual(
      cursorResult.attempts.map((attempt) => attempt.submissionId),
      ["10"],
    );
    const metadata = await new ProblemMetadataResolver(settings).resolve(
      page,
      problemIdSchema.parse(1339),
    );
    assert.deepEqual(metadata, {
      problemId: 1339,
      title: null,
      tier: 0,
    });
    await page.route("**/api/submission*", (route) =>
      route.fulfill({ body: Buffer.from("malformed") }),
    );
    await assert.rejects(collector.collect(page, plan(0n, 2)), {
      code: "invalid_bson",
    });
    await page.unroute("**/api/submission*");
    await page.route("**/api/submission*", (route) =>
      route.fulfill({
        body: Buffer.from(
          serialize({
            data: {
              list: [
                { id: 10, p: 1339, r: "AC", a: "JAVA", t: 1788608362887 },
                { id: 11, p: 1339, r: "WA", a: "JAVA", t: 1788608362887 },
              ],
              paging: { cursor: "11", more: false },
            },
          }).map((byte) => byte ^ 0xaa),
        ),
      }),
    );
    await assert.rejects(collector.collect(page, plan(0n, 2)), {
      code: "submission_order_invalid",
    });
    await page.unroute("**/api/submission*");
    await page.route("**/group/1125/rank", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<table><tr><th>rank</th></tr><tr><td>1</td><td><a href="/account/42">member</a></td><td>?</td><td>0</td><td>0</td><td>0</td></tr></table>',
      }),
    );
    await assert.rejects(new RankCollector(settings).collect(page, 1125), {
      code: "invalid_rank",
    });
    await assert.rejects(
      collector.collect(page, plan(0n, 2), AbortSignal.abort()),
      { code: "cancelled" },
    );
  } finally {
    await browser.close();
  }
});
