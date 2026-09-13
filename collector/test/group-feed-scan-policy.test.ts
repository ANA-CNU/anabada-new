import assert from "node:assert/strict";
import test from "node:test";
import { GroupFeedScanPolicy } from "../src/application/group-feed-scan-policy.js";
import { accountIdSchema } from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";

const submission = (id: string) => ({
  accountId: accountIdSchema.parse("1"),
  submissionId: submissionIdSchema.parse(id),
  problemId: problemIdSchema.parse(1000),
  submittedAt: new Date("2026-09-10T00:00:00Z"),
  score: null,
});

test("Given a sparse checkpoint boundary When scanning old rows Then exactly ten observed overlaps stop pagination", () => {
  const decision = new GroupFeedScanPolicy().decide(
    {
      upperInclusiveSubmissionId: "200",
      lowerCursor: "100",
      overlapObservedCount: 8,
    },
    {
      submissions: [submission("103"), submission("91"), submission("2")],
      more: true,
    },
  );

  assert.deepEqual(
    decision.accepted.map((item) => item.submissionId),
    ["103", "91", "2"],
  );
  assert.equal(decision.overlapObservedCount, 10);
  assert.equal(decision.cursorReached, true);
});

test("Given a first window When scanning a nonterminal DOM page Then all rows are accepted", () => {
  const decision = new GroupFeedScanPolicy().decide(
    {
      upperInclusiveSubmissionId: "900",
      lowerCursor: null,
      overlapObservedCount: 0,
    },
    { submissions: [submission("900")], more: true },
  );

  assert.equal(decision.accepted.length, 1);
  assert.equal(decision.cursorReached, false);
});

test("Given a frozen upper head When newer rows arrive during scanning Then they stay outside the durable window", () => {
  const decision = new GroupFeedScanPolicy().decide(
    {
      upperInclusiveSubmissionId: "900",
      lowerCursor: "100",
      overlapObservedCount: 0,
    },
    {
      submissions: [submission("901"), submission("900")],
      more: false,
    },
  );

  assert.deepEqual(
    decision.accepted.map((item) => item.submissionId),
    ["900"],
  );
});

test("Given a checkpoint-equality row When scanning overlap Then it is retained without consuming an older-row allowance", () => {
  const decision = new GroupFeedScanPolicy().decide(
    {
      upperInclusiveSubmissionId: "200",
      lowerCursor: "100",
      overlapObservedCount: 9,
    },
    {
      submissions: [submission("100"), submission("99")],
      more: false,
    },
  );

  assert.deepEqual(
    decision.accepted.map((item) => item.submissionId),
    ["100", "99"],
  );
  assert.equal(decision.overlapObservedCount, 10);
});

test("Given an empty nonterminal page When deciding progress Then the page is rejected", () => {
  assert.throws(
    () =>
      new GroupFeedScanPolicy().decide(
        {
          upperInclusiveSubmissionId: "200",
          lowerCursor: null,
          overlapObservedCount: 0,
        },
        { submissions: [], more: true },
      ),
    { message: "group_feed_empty_nonterminal_page" },
  );
});

test("Given an ascending submission page When deciding progress Then ambiguous ordering is rejected", () => {
  assert.throws(
    () =>
      new GroupFeedScanPolicy().decide(
        {
          upperInclusiveSubmissionId: "200",
          lowerCursor: null,
          overlapObservedCount: 0,
        },
        {
          submissions: [submission("100"), submission("101")],
          more: false,
        },
      ),
    { message: "group_feed_non_descending_submission_ids" },
  );
});
