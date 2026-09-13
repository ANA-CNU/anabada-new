import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { chromium } from "playwright";
import { rankMemberSchema } from "../src/domain/sync.js";
import { JungolError } from "../src/jungol/errors.js";
import { GroupSubmissionDomParser } from "../src/jungol/group-submission-dom.js";
import { SubmissionTimestampReader } from "../src/jungol/submission-timestamp.js";

const member = rankMemberSchema.parse({
  accountId: "42",
  jungolName: "known",
  solvedCount: 0,
  wrongCount: 0,
  acRating: 0,
  tier: 0,
});

test("actor mismatch preserves safe submission and problem diagnostics", async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<table><tbody><tr><td>1</td><td><a href="/account/99">unknown</a></td><td><a href="/problem/1000">1000</a></td><td>정답 100점</td><td>1ms</td><td>1KB</td><td>1</td><td>C++</td><td><a href="/group/1125/submission?result=AC&sid=12">12</a></td></tr></tbody></table>',
    );
    await assert.rejects(
      new GroupSubmissionDomParser(new SubmissionTimestampReader(1_000)).parse(
        page,
        [page.locator("tbody tr")],
        [member],
      ),
      (error: unknown) => {
        assert.ok(error instanceof JungolError);
        assert.equal(error.code, "group_feed_actor_unmatched");
        assert.deepEqual(error.diagnostics, {
          stage: "group_feed_actor_resolution",
          reason: "mismatch",
          lastSubmissionId: "12",
          problemId: 1000,
          expectedCount: 1,
          location: {
            method: "GroupSubmissionDomParser.parse",
            source: "collector/src/jungol/group-submission-dom.ts",
            line: error.diagnostics?.location?.line,
          },
        });
        assert.ok((error.diagnostics?.location?.line ?? 0) > 0);
        return true;
      },
    );
  } finally {
    await browser.close();
  }
});
