import assert from "node:assert/strict";
import test from "node:test";
import { problemIdSchema } from "../src/domain.js";
import { ProblemTierEstimator } from "../src/group-domain.js";

test("Given an uncached problem When estimating its tier Then the conservative tier is zero", async () => {
  const estimator = new ProblemTierEstimator();
  const problemId = problemIdSchema.parse(1000);

  const tier = await estimator.estimate_tier(problemId);

  assert.equal(tier, 0);
});
