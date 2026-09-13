import assert from "node:assert/strict";
import { test } from "node:test";
import { errors } from "playwright";
import { GroupFeedCursorError } from "../src/group-feed-error.js";
import { JungolError } from "../src/jungol/errors.js";
import { type PageCloser, PageOperation } from "../src/jungol/page.js";

test("Given a boundary error from page work When PageOperation runs Then it preserves the exact error", async () => {
  const page: PageCloser = { close: async () => {} };
  const expected = new GroupFeedCursorError();

  await assert.rejects(
    new PageOperation().run(page, undefined, async () => {
      throw expected;
    }),
    (error: unknown) => {
      assert.equal(error, expected);
      assert.equal(error instanceof GroupFeedCursorError, true);
      return true;
    },
  );
});

test("Given a group navigation timeout When PageOperation translates it Then it retains the precise safe stage", async () => {
  // Given
  const page: PageCloser = { close: async () => {} };

  // When / Then
  await assert.rejects(
    new PageOperation().run(
      page,
      undefined,
      async () => {
        throw new errors.TimeoutError("private browser detail");
      },
      { code: "group_feed_navigation_failed", stage: "navigation" },
    ),
    (error: unknown) => {
      assert.equal(error instanceof JungolError, true);
      assert.equal((error as JungolError).code, "group_feed_navigation_failed");
      assert.deepEqual((error as JungolError).diagnostics, {
        stage: "navigation",
        reason: "timeout",
      });
      return true;
    },
  );
});
