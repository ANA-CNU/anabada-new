import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { serialize } from "bson";
import { type Browser, chromium } from "playwright";
import { CycleTrace } from "../src/application/cycle-diagnostics.js";
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
  | "rejected_429"
  | "server_error"
  | "invalid_fingerprint"
  | "invalid_schema"
  | "unresolved_actor"
  | "missing_header"
  | "missing_row"
  | "navigation_timeout"
  | "response_timeout"
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
      if (mode === "response_timeout") return;
      if (mode === "rejected" || mode === "rejected_429") {
        response.statusCode = mode === "rejected" ? 403 : 429;
        response.end();
        return;
      }
      if (mode === "server_error") {
        response.statusCode = 500;
        response.end();
        return;
      }
      response.setHeader(
        "x-fp",
        mode === "invalid_fingerprint" ? "not-a-fingerprint" : fingerprint,
      );
      response.setHeader("cache-control", "no-store");
      if (mode === "malformed") {
        response.end(Buffer.from("malformed"));
        return;
      }
      if (mode === "invalid_schema") {
        response.end(encrypted({ data: { invalid: true } }));
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
                    u: mode === "unresolved_actor" ? "unknown" : "member",
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
      if (mode === "navigation_timeout") {
        setTimeout(() => response.end("late"), 1_500);
        return;
      }
      if (mode === "auth") {
        response.statusCode = 302;
        response.setHeader("location", "/auth/signin");
        response.end();
        return;
      }
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`
        <table><thead><tr>${mode === "missing_header" ? "" : '<th scope="col">제출</th>'}</tr></thead><tbody>${mode === "empty" || mode === "missing_row" ? "" : "<tr><td>ready</td></tr>"}</tbody></table>
        <button onclick="fetch('/api/group/1125/submission?result=AC&cursor=cursor-a', ${mode === "invalid_fingerprint" ? "{}" : "{headers:{'x-fp':'aa'}}"}).then(response => response.arrayBuffer())">더 불러오기</button>
        <script>fetch('/api/group/1125/submission?result=AC', ${mode === "invalid_fingerprint" ? "{}" : "{headers:{'x-fp':'aa'}}"}).then(response => response.arrayBuffer())</script>
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
  const trace = new CycleTrace("fixture-cycle");
  const collector = new GroupFeedCollector(
    { baseUrl, pageTimeoutMs: 3000 },
    new JungolRequestCoordinator({ delay: async () => {} }),
    undefined,
    undefined,
    trace,
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
  assert.equal(
    trace
      .snapshot()
      .events.some((event) => event.stage === "submission_response_observed"),
    true,
  );

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
  assert.equal(trace.snapshot().firstFailure?.stage, "submission_cursor");

  for (const [failure, code, stage] of [
    ["malformed", "invalid_bson", "submission_bson"],
    ["invalid_fingerprint", "invalid_fingerprint", "submission_fingerprint"],
    ["invalid_schema", "invalid_envelope", "submission_schema"],
    ["unresolved_actor", "group_actor_unresolved", "submission_actor"],
    ["missing_header", "group_feed_header_failed", "submission_header_wait"],
    ["missing_row", "group_feed_rows_failed", "submission_rows_wait"],
    ["rejected", "jungol_http_rejected", "submission_response_status"],
    ["rejected_429", "jungol_http_rejected", "submission_response_status"],
    ["server_error", "group_feed_http_failed", "submission_response_status"],
    ["non_ac", "group_feed_non_ac_result", "submission_schema"],
    ["navigation_timeout", "group_feed_navigation_failed", "page_navigation"],
    [
      "response_timeout",
      "group_feed_responsewait_failed",
      "submission_response_wait",
    ],
  ] as const) {
    // Given
    mode = failure;
    const failurePage = await browser.newPage();

    // When / Then
    const failureTrace = new CycleTrace(`fixture-${failure}`);
    const failureCollector = new GroupFeedCollector(
      { baseUrl, pageTimeoutMs: failure.includes("timeout") ? 500 : 3_000 },
      new JungolRequestCoordinator({ delay: async () => {} }),
      undefined,
      undefined,
      failureTrace,
    );
    try {
      await assert.rejects(
        failureCollector.readPage(failurePage, [member], null),
        { code },
      );
      assert.equal(failureTrace.snapshot().firstFailure?.stage, stage);
      const { pageNumber } =
        failureTrace.snapshot().firstFailure?.context ?? {};
      assert.equal(pageNumber, 1);
    } finally {
      await failurePage.close();
    }
  }

  mode = "normal";
  const paginationFailurePage = await browser.newPage();
  const paginationFailureTrace = new CycleTrace("fixture-pagination-timeout");
  const paginationFailureCollector = new GroupFeedCollector(
    { baseUrl, pageTimeoutMs: 500 },
    new JungolRequestCoordinator({ delay: async () => {} }),
    undefined,
    undefined,
    paginationFailureTrace,
  );
  try {
    const firstPage = await paginationFailureCollector.readPage(
      paginationFailurePage,
      [member],
      null,
    );
    mode = "response_timeout";
    await assert.rejects(
      paginationFailureCollector.readPage(
        paginationFailurePage,
        [member],
        firstPage.nextCursor,
      ),
      { code: "group_feed_responsewait_failed" },
    );
    const { pageNumber } =
      paginationFailureTrace.snapshot().firstFailure?.context ?? {};
    assert.equal(pageNumber, 2);
  } finally {
    await paginationFailurePage.close();
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
