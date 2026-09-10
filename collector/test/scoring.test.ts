import assert from "node:assert/strict";
import test from "node:test";
import { DailyScorePolicy, KstCalendar } from "../src/scoring/daily.js";
import { EventManager } from "../src/scoring/events.js";

test("daily eligibility uses first solve, tier zero, threshold and KST day", () => {
  const calendar = new KstCalendar();
  const policy = new DailyScorePolicy(calendar);
  assert.equal(calendar.day(new Date("2026-09-06T15:00:00Z")), "2026-09-07");
  for (const tier of [11, 15]) {
    assert.equal(
      policy.evaluate({
        userId: 1,
        problemRowId: 1,
        problemNumber: 10,
        submittedAt: new Date(0),
        firstSolve: true,
        problemTier: tier,
        userTier: 20,
        alreadyAwarded: false,
      }) !== null,
      true,
    );
  }
  assert.equal(
    policy.evaluate({
      userId: 1,
      problemRowId: 1,
      problemNumber: 10,
      submittedAt: new Date(0),
      firstSolve: true,
      problemTier: 0,
      userTier: 20,
      alreadyAwarded: false,
    }),
    null,
  );
  assert.equal(
    policy.evaluate({
      userId: 1,
      problemRowId: 1,
      problemNumber: 10,
      submittedAt: new Date(0),
      firstSolve: true,
      problemTier: 10,
      userTier: 20,
      alreadyAwarded: false,
    }),
    null,
  );
  assert.equal(
    policy.evaluate({
      userId: 1,
      problemRowId: 1,
      problemNumber: 10,
      submittedAt: new Date(0),
      firstSolve: false,
      problemTier: 30,
      userTier: 20,
      alreadyAwarded: false,
    }),
    null,
  );
  assert.equal(
    policy.evaluate({
      userId: 1,
      problemRowId: 1,
      problemNumber: 10,
      submittedAt: new Date(0),
      firstSolve: true,
      problemTier: 5,
      userTier: 10,
      alreadyAwarded: false,
    }) !== null,
    true,
  );
});

test("monthly bias window rolls over the year at midnight KST", () => {
  const [start, end] = new KstCalendar().monthWindow(
    new Date("2026-12-31T15:00:00Z"),
  );
  assert.equal(start.toISOString(), "2026-12-31T15:00:00.000Z");
  assert.equal(end.toISOString(), "2027-01-31T15:00:00.000Z");
});

test("monthly bias window does not overflow after a KST month whose UTC start is month-end", () => {
  const [start, end] = new KstCalendar().monthWindow(
    new Date("2026-09-07T00:00:00Z"),
  );
  assert.equal(start.toISOString(), "2026-08-31T15:00:00.000Z");
  assert.equal(end.toISOString(), "2026-09-30T15:00:00.000Z");
});

test("overlapping events award individually with exclusive end and no retroactivity", () => {
  const event = {
    eventId: 1,
    problemNumber: 10,
    begin: new Date("2026-09-01Z"),
    end: new Date("2026-10-01Z"),
    createdAt: new Date("2026-09-03Z"),
    addedAt: new Date("2026-09-04Z"),
  };
  const manager = new EventManager(
    [event, { ...event, eventId: 2 }],
    new KstCalendar(),
  );
  const detect = (
    submittedAt: Date,
    syncMode: "initial_summary" | "incremental" = "incremental",
  ) =>
    manager.detect({
      syncMode,
      userId: 1,
      problemRowId: 1,
      problemNumber: 10,
      submittedAt,
    });
  assert.equal(detect(new Date("2026-09-04Z")).length, 2);
  assert.equal(detect(new Date("2026-09-03Z")).length, 0);
  assert.equal(detect(new Date("2026-10-01Z")).length, 0);
  assert.equal(detect(new Date("2026-09-04Z"), "initial_summary").length, 0);
});
