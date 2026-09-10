import assert from "node:assert/strict";
import test from "node:test";
import { orderAcceptedAttempts } from "../src/account-settlement.js";
import { AcceptedAttempt } from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";

test("Given unordered accepted attempts When ordering a settlement batch Then original time and submission ID decide scoring order", () => {
  const later = new AcceptedAttempt(
    submissionIdSchema.parse(12),
    problemIdSchema.parse(2),
    null,
    0,
    new Date("2026-09-02T00:00:00Z"),
    null,
    11,
  );
  const earlierHigherId = new AcceptedAttempt(
    submissionIdSchema.parse(11),
    problemIdSchema.parse(1),
    null,
    0,
    new Date("2026-09-01T00:00:00Z"),
    null,
    11,
  );
  const earlierLowerId = new AcceptedAttempt(
    submissionIdSchema.parse(10),
    problemIdSchema.parse(3),
    null,
    0,
    new Date("2026-09-01T00:00:00Z"),
    null,
    11,
  );

  const ordered = orderAcceptedAttempts([
    later,
    earlierHigherId,
    earlierLowerId,
  ]);

  assert.deepEqual(
    ordered.map((attempt) => attempt.submissionId),
    ["10", "11", "12"],
  );
});
