import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { serialize } from "bson";
import { type Browser, chromium } from "playwright";
import { rankMemberSchema } from "../src/domain/sync.js";
import { GroupFeedCollector } from "../src/jungol/group-feed.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

const fingerprint = "aa";
const member = rankMemberSchema.parse({
  accountId: "42",
  jungolName: "member",
  solvedCount: 1,
  wrongCount: 0,
  acRating: 30,
  tier: 1,
});

type FixtureMode =
  | "normal"
  | "empty"
  | "malformed"
  | "non_ac"
  | "rejected"
  | "auth";

function encrypted(body: Parameters<typeof serialize>[0]): Uint8Array {
  return serialize(body).map((byte) => byte ^ 0xaa);
}

test("Given local group pages When resuming a feed Then it reuses only matching in-page pagination", async (t) => {
  // Given
  let mode: FixtureMode = "normal";
  let documentNavigations = 0;
  const apiRequests: URL[] = [];
  const server = createServer((request, response) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "127.0.0.1"}`,
    );
    if (requestUrl.pathname === "/api/group/1125/submission") {
      apiRequests.push(requestUrl);
      if (mode === "rejected") {
        response.statusCode = 403;
        response.end();
        return;
      }
      response.setHeader("x-fp", fingerprint);
      response.setHeader("cache-control", "no-store");
      if (mode === "malformed") {
        response.end(Buffer.from("malformed"));
        return;
      }
      const second = requestUrl.searchParams.get("cursor") === "cursor-a";
      const body = encrypted({
        data: {
          list: [
            ...(mode === "empty"
              ? []
              : [
                  {
                    id: second ? 8 : 9,
                    p: 1339,
                    r: mode === "non_ac" ? "WA" : "AC",
                    s: 100,
                    u: "member",
                    t: 1788608362887,
                  },
                ]),
          ],
          paging: {
            type: "next",
            cursor: second ? "cursor-b" : "cursor-a",
            more: mode === "empty" ? false : !second,
          },
        },
      });
      response.end(body);
      return;
    }
    if (requestUrl.pathname === "/group/1125/submission") {
      documentNavigations += 1;
      if (mode === "auth") {
        response.statusCode = 302;
        response.setHeader("location", "/auth/signin");
        response.end();
        return;
      }
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`
        <table><thead><tr><th scope="col">제출</th><th scope="col">문제</th><th scope="col">결과</th><th scope="col">점수</th><th scope="col">사용자</th><th scope="col">언어</th><th scope="col">메모리</th><th scope="col">시간</th><th scope="col">제출일</th></tr></thead><tbody>${mode === "empty" ? "" : "<tr><td>ready</td></tr>"}</tbody></table>
        <button onclick="fetch('/api/group/1125/submission?result=AC&cursor=cursor-a', {headers:{'x-fp':'aa'}}).then(response => response.arrayBuffer())">더 불러오기</button>
        <script>fetch('/api/group/1125/submission?result=AC', {headers:{'x-fp':'aa'}}).then(response => response.arrayBuffer())</script>
      `);
      return;
    }
    if (requestUrl.pathname === "/auth/signin") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<main>sign in</main>");
      return;
    }
    response.statusCode = 404;
    response.end();
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
  const baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  const collector = new GroupFeedCollector(
    { baseUrl, pageTimeoutMs: 3000 },
    new JungolRequestCoordinator({ delay: async () => {} }),
  );
  const page = await browser.newPage();

  // When
  const first = await collector.readPage(page, [member], null);
  const second = await collector.readPage(page, [member], first.nextCursor);

  // Then
  assert.equal(documentNavigations, 1);
  assert.equal(apiRequests.length, 2);
  assert.deepEqual(
    apiRequests.map((url) => url.searchParams.get("cursor")),
    [null, "cursor-a"],
  );
  assert.deepEqual(
    first.submissions.map((submission) => submission.accountId),
    ["42"],
  );
  assert.equal(second.nextCursor, null);

  // Given
  apiRequests.length = 0;
  documentNavigations = 0;
  const resumedPage = await browser.newPage();

  // When
  const resumed = await collector.readPage(resumedPage, [member], "cursor-a");

  // Then
  assert.equal(documentNavigations, 1);
  assert.equal(apiRequests.length, 1);
  assert.equal(apiRequests[0]?.searchParams.get("cursor"), "cursor-a");
  assert.equal(resumed.submissions[0]?.submissionId, "8");

  // Given
  mode = "empty";
  const emptyPage = await browser.newPage();

  // When
  const empty = await collector.readPage(emptyPage, [member], null);

  // Then
  assert.deepEqual(empty.submissions, []);

  // Given
  mode = "normal";
  const wrongCursorPage = await browser.newPage();
  const wrongCursorFirst = await collector.readPage(
    wrongCursorPage,
    [member],
    null,
  );
  await wrongCursorPage
    .getByRole("button", { name: "더 불러오기" })
    .evaluate((button) =>
      button.setAttribute(
        "onclick",
        "fetch('/api/group/1125/submission?result=AC&cursor=cursor-b', {headers:{'x-fp':'aa'}}).then(response => response.arrayBuffer())",
      ),
    );

  // When / Then
  await assert.rejects(
    collector.readPage(wrongCursorPage, [member], wrongCursorFirst.nextCursor),
    { code: "group_feed_invalid_cursor" },
  );

  for (const failure of ["malformed", "non_ac", "rejected"] as const) {
    // Given
    mode = failure;
    const failurePage = await browser.newPage();

    // When / Then
    await assert.rejects(collector.readPage(failurePage, [member], null), {
      code:
        failure === "malformed"
          ? "invalid_bson"
          : failure === "non_ac"
            ? "group_feed_non_ac_result"
            : "jungol_http_rejected",
    });
  }

  // Given
  mode = "auth";
  const authPage = await browser.newPage();

  // When / Then
  await assert.rejects(collector.readPage(authPage, [member], null), {
    code: "auth_required",
  });
  assert.ok(apiRequests.every((url) => url.origin === baseUrl));
});
