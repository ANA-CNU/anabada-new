import assert from "node:assert/strict";
import test from "node:test";
import { groupMemberSchema } from "../src/domain/sync.js";
import { GroupFeedCollector } from "../src/jungol/group-feed.js";
import { asyncBrowserFixture } from "./async-browser-fixture.js";

const member = groupMemberSchema.parse({
  accountId: "42",
  jungolName: "member",
  tier: 0,
});

test("Given an aborted delayed DOM page When the production feed waits Then it returns cancellation rather than an empty page", async (t) => {
  const html = `<table><thead><tr><th>번호</th><th>제출자</th><th>문제</th><th>결과</th><th>시간</th><th>메모리</th><th>길이</th><th>언어</th><th>시각</th></tr></thead><tbody></tbody></table><main>로딩 중</main>`;
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    html,
    new Map(),
  );
  const abort = new AbortController();
  const pending = new GroupFeedCollector(settings, requests).readPage(
    page,
    [member],
    { lastScannedSubmissionId: null },
    abort.signal,
  );
  abort.abort();
  await assert.rejects(pending, { code: "cancelled" });
});
