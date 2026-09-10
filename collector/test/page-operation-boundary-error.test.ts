import assert from "node:assert/strict";
import { test } from "node:test";
import { GroupFeedCursorError } from "../src/group-feed-error.js";
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
