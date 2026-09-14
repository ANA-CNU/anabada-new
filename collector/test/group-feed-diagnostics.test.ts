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
        observedAccountId: "99",
        problemId: 1000,
        expectedCount: 24,
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
  assert.match(facts, /계정 `99`/);
  assert.match(facts, /문제 `1000`/);
  assert.match(facts, /멤버 수 `24`/);
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

test("Given an actor-resolution diagnostic When converting it to incident facts Then the missing member label is preserved", () => {
  const facts = new IncidentFacts()
    .groupFeedDiagnosticsForAlert(
      new JungolError("group_feed_actor_unmatched", {
        stage: "group_feed_actor_resolution",
        reason: "mismatch",
        observedAccountId: "99",
      }).diagnostics,
    )
    .join("\n");
  assert.match(facts, /목록에 없는 사용자 발견 `99`/);
});
