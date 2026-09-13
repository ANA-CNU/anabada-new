import assert from "node:assert/strict";
import test from "node:test";
import { IncidentFacts } from "../src/incident-facts.js";
import { JungolError } from "../src/jungol/errors.js";

test("Given unsafe DOM diagnostic extras When converting them to incident facts Then only approved operational fields are rendered", () => {
  // Given
  const diagnostics = new JungolError(
    "group_feed_rows_timeout",
    Object.assign(
      {
        stage: "group_feed_rows_growth_wait" as const,
        reason: "timeout" as const,
        timeoutMs: 30_000,
        pageNumber: 3,
        previousRowCount: 100,
        currentRowCount: 100,
        lastSubmissionId: "9999",
        loadingVisible: true,
        location: {
          method: "GroupFeedCollector.loadNextPage",
          source: "collector/src/jungol/group-feed.ts",
          line: 211,
        },
      },
      {
        cookie: "private-cookie",
        url: "https://private.example/path?token=secret",
        html: "<password>secret</password>",
        stack: "private-stack",
      },
    ),
  ).diagnostics;

  // When
  const facts = new IncidentFacts()
    .groupFeedDiagnosticsForAlert(diagnostics)
    .join("\n");

  // Then
  assert.match(facts, /페이지 `3`/);
  assert.match(facts, /기존 행 `100` \/ 현재 행 `100`/);
  assert.match(facts, /로딩 표시 `true`/);
  assert.match(facts, /실행 commit `unknown`/);
  assert.match(
    facts,
    /위치 `GroupFeedCollector\.loadNextPage \(collector\/src\/jungol\/group-feed\.ts:211\)`/,
  );
  for (const forbidden of [
    "private-cookie",
    "private.example",
    "secret",
    "private-stack",
  ])
    assert.equal(facts.includes(forbidden), false);
});
