import assert from "node:assert/strict";
import test from "node:test";
import { AcceptedAttempt } from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";
import { AcRatingTierMapper } from "../src/scoring/tier.js";

const thresholds = [
  0, 30, 60, 90, 120, 150, 200, 300, 400, 500, 650, 800, 950, 1100, 1250, 1400,
  1600, 1750, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800, 2850,
  2900, 2950, 3000,
] as const;

test("Given every AC Rating boundary When mapping Then the 0 through 31 tier contract holds", () => {
  const mapper = new AcRatingTierMapper();
  thresholds.forEach((threshold, tier) => {
    assert.equal(mapper.toTier(threshold), tier);
    if (tier > 0) assert.equal(mapper.toTier(threshold - 1), tier - 1);
  });
  assert.equal(mapper.toTier(30_000), 31);
});

test("Given an invalid AC Rating When mapping Then it is rejected", () => {
  const mapper = new AcRatingTierMapper();
  for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => mapper.toTier(value), RangeError);
  }
});

test("Given real and invalid problem tiers When resolving an accepted attempt Then only 1 through 31 override the fallback", () => {
  const effectiveTier = (problemTier: number) =>
    new AcceptedAttempt(
      submissionIdSchema.parse(1),
      problemIdSchema.parse(1),
      null,
      problemTier,
      new Date("2026-09-10T00:00:00Z"),
      null,
      9,
    ).effectiveTier;
  assert.equal(effectiveTier(1), 1);
  assert.equal(effectiveTier(31), 31);
  for (const invalid of [-1, 0, 32, 1.5, Number.NaN])
    assert.equal(effectiveTier(invalid), 9);
});
