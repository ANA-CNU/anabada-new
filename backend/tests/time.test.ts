import { expect, test } from "bun:test";
import { KstCalendar } from "../src/infrastructure/time.js";

test("Given invalid calendar days When parsing KST Then rejects rollover while preserving leap days", () => {
  const calendar = new KstCalendar();
  expect(calendar.parseKst("2026-02-31 00:00:00")).toBeUndefined();
  expect(calendar.parseKst("2025-02-29 00:00:00")).toBeUndefined();
  expect(calendar.parseKst("2024-02-29 00:00:00")?.toISOString()).toBe(
    "2024-02-28T15:00:00.000Z",
  );
});

test("Given a January KST date When deriving twelve buckets Then spans exact KST month boundaries", () => {
  const buckets = new KstCalendar().recentMonths(
    new Date("2026-01-01T00:00:00.000Z"),
  );
  expect(buckets).toHaveLength(12);
  expect(buckets[0]?.key).toBe("2025-02");
  expect(buckets[11]).toMatchObject({ key: "2026-01" });
  expect(buckets[11]?.start.toISOString()).toBe("2025-12-31T15:00:00.000Z");
});
