import assert from "node:assert/strict";
import test from "node:test";
import { AtomicCycleFailure } from "../src/application/cycle-atomic-error.js";
import { CycleTrace } from "../src/application/cycle-diagnostics.js";
import { GroupCycleReportMapper } from "../src/application/group-cycle-report.js";
import {
  CollectorIncidentFactory,
  EmergencyAlertFormatter,
} from "../src/emergency-alert.js";
import { JungolError } from "../src/jungol/errors.js";

for (const imageObserved of [true, false]) {
  test(`metadata timeout reaches the actual alert boundary with imageObserved=${imageObserved}`, async () => {
    let now = 0;
    const trace = new CycleTrace("metadata-alert", () => now);
    try {
      await trace.run("problem_metadata", { problemId: 5498 }, async () => {
        now = 30000;
        throw new JungolError("problem_metadata_timeout", {
          stage: "problem_metadata_readiness",
          reason: "timeout",
          problemId: 5498,
          timeoutMs: 30000,
          imageObserved,
          titleObserved: false,
        });
      });
      assert.fail("must propagate timeout");
    } catch (error) {
      assert.ok(error instanceof JungolError);
      const report = new GroupCycleReportMapper().failure(
        new AtomicCycleFailure(error, trace.snapshot()),
      );
      assert.equal(report.status, "failed");
      assert.equal(report.cycleTrace?.transactionStatus, "not_started");
      const incident = new CollectorIncidentFactory().fromCycle(report);
      assert.ok(incident);
      const content = new EmergencyAlertFormatter().format(incident);
      assert.match(content, /`problem_metadata_timeout`/);
      assert.match(content, /`5498`/);
      assert.match(content, /`30000/);
      assert.ok(content.includes(`\`${imageObserved}\``));
      assert.match(content, /`not_started`/);
      assert.ok(content.length <= 2000);
      for (const line of content.split("\n"))
        assert.equal((line.match(/`/g) ?? []).length % 2, 0);
    } finally {
      trace.dispose();
    }
  });
}
