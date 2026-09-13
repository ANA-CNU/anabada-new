import { expect, test } from "bun:test";
import type { RowDataPacket } from "mysql2/promise";
import { AtomicCycleFailure } from "../../../collector/src/application/cycle-atomic-error.js";
import { createScoreFlowFixture } from "./custom-daily-fixture.js";

type Fixture = Awaited<ReturnType<typeof createScoreFlowFixture>>;
interface ScoreRow extends RowDataPacket {
  id: number;
  rule_type: string;
  bias: number;
  score_day: string | null;
  day: string;
}
async function ledger(fixture: Fixture) {
  const [rows] = await fixture.rawPool.query<ScoreRow[]>(
    "SELECT id,rule_type,bias,DATE_FORMAT(score_day,'%Y-%m-%d') score_day,DATE_FORMAT(created_at,'%Y-%m-%d') day FROM score_history WHERE user_id=2 AND created_at>='2026-09-08' ORDER BY id",
  );
  return rows;
}
async function cache(fixture: Fixture) {
  const [rows] = await fixture.rawPool.query<
    (RowDataPacket & { total: number })[]
  >(
    "SELECT total_point total FROM user_bias_total WHERE user_id=2 AND score_month='2026-09-01'",
  );
  return rows[0]?.total;
}

for (const bias of [5, -3]) {
  test(`Given custom ${bias} via admin API When the collector settles and replays same-day AC Then daily and event are independent and cached exactly once`, async () => {
    const fixture = await createScoreFlowFixture();
    try {
      await fixture.custom(bias);
      expect(await cache(fixture)).toBe(bias);
      expect((await fixture.settle()).status).toBe("success");
      const rows = await ledger(fixture);
      expect(
        rows.map(({ rule_type, bias: points, score_day, day }) => ({
          rule_type,
          points,
          score_day,
          day,
        })),
      ).toEqual([
        {
          rule_type: "custom",
          points: bias,
          score_day: null,
          day: "2026-09-08",
        },
        {
          rule_type: "daily",
          points: 1,
          score_day: "2026-09-08",
          day: "2026-09-08",
        },
        {
          rule_type: "event",
          points: 1,
          score_day: "2026-09-08",
          day: "2026-09-08",
        },
      ]);
      expect(await cache(fixture)).toBe(bias + 2);
      expect((await fixture.settle()).settlement.duplicateAttemptCount).toBe(1);
      await fixture.settle(7002, 3001);
      expect(await ledger(fixture)).toEqual(rows);
      expect(await cache(fixture)).toBe(bias + 2);
      const response = await fixture.request(
        "GET",
        "/api/admin/score-history?username=beta",
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({ rule_type: "custom", bias }),
          expect.objectContaining({
            rule_type: "daily",
            score_day: "2026-09-08",
          }),
          expect.objectContaining({
            rule_type: "event",
            score_day: "2026-09-08",
          }),
        ]),
      });
      const custom = rows.find((row) => row.rule_type === "custom");
      if (!custom) throw new Error("missing custom row");
      expect(
        (
          await fixture.request("PUT", `/api/score-history/${custom.id}`, {
            bias: 8,
          })
        ).status,
      ).toBe(200);
      expect(await cache(fixture)).toBe(10);
      expect(
        (await fixture.request("DELETE", `/api/score-history/${custom.id}`))
          .status,
      ).toBe(200);
      expect(await cache(fixture)).toBe(2);
      expect((await ledger(fixture)).map((row) => row.rule_type)).toEqual([
        "daily",
        "event",
      ]);
      expect(fixture.incidents).toEqual([]);
    } finally {
      await fixture.close();
    }
  });
}

test("Given committed custom score When collector daily INSERT fails Then its entire cycle rolls back but custom survives and retry awards once", async () => {
  const fixture = await createScoreFlowFixture();
  try {
    await fixture.custom(5);
    const before = await ledger(fixture);
    await fixture.rawPool.query(
      "CREATE TRIGGER cross_daily_failure BEFORE INSERT ON score_history FOR EACH ROW BEGIN IF NEW.rule_type='daily' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'; END IF; END",
    );
    try {
      const failedCycle = fixture.settle();
      await expect(failedCycle).rejects.toBeInstanceOf(AtomicCycleFailure);
      await expect(failedCycle).rejects.toMatchObject({
        cycleTrace: { transactionStatus: "rolled_back" },
      });
      expect(await ledger(fixture)).toEqual(before);
      expect(await cache(fixture)).toBe(5);
      const [state] = await fixture.rawPool.query<
        (RowDataPacket & { cursor: string; attempts: string; inbox: string })[]
      >(
        "SELECT CAST(committed_cursor AS CHAR) AS `cursor`,(SELECT COUNT(*) FROM problem WHERE external_submission_id=7001) attempts,(SELECT COUNT(*) FROM collector_ac_inbox) inbox FROM collector_checkpoint WHERE group_id=1125",
      );
      expect(
        state.map(({ cursor, attempts, inbox }) => ({
          cursor,
          attempts,
          inbox,
        })),
      ).toEqual([{ cursor: "1002", attempts: "0", inbox: "0" }]);
    } finally {
      await fixture.rawPool.query("DROP TRIGGER cross_daily_failure");
    }
    await fixture.settle();
    expect((await ledger(fixture)).map((row) => row.rule_type)).toEqual([
      "custom",
      "daily",
      "event",
    ]);
    expect(await cache(fixture)).toBe(7);
  } finally {
    await fixture.close();
  }
});
