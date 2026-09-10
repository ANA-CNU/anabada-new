import assert from "node:assert/strict";
import test from "node:test";
import { GroupFeedScanPolicy } from "../src/application/group-feed-scan-policy.js";
import { accountIdSchema } from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";

const page = (ids: readonly string[]) => ({
  submissions: ids.map((id) => ({
    accountId: accountIdSchema.parse("1"),
    submissionId: submissionIdSchema.parse(id),
    problemId: problemIdSchema.parse(1000),
    submittedAt: new Date("2026-09-10T00:00:00Z"),
    score: null,
  })),
  nextCursor: null,
  more: false,
});

test("Given new submissions above the committed cursor When opening an idle window Then its upper bound is the first page head", () => {
  assert.equal(
    GroupFeedScanPolicy.freezeUpper("100", null, page(["125", "124"])),
    "125",
  );
});

test("Given a partial frozen window When later pages contain a newer head Then its original upper bound remains unchanged", () => {
  assert.equal(
    GroupFeedScanPolicy.freezeUpper("100", "125", page(["130"])),
    "125",
  );
});

test("Given an empty or old first page When opening an idle window Then the committed cursor remains the upper bound", () => {
  assert.equal(GroupFeedScanPolicy.freezeUpper("100", null, page([])), "100");
  assert.equal(
    GroupFeedScanPolicy.freezeUpper("100", null, page(["99"])),
    "100",
  );
});
