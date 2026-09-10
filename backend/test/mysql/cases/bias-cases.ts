import { expect } from "bun:test";
import type { RowDataPacket } from "mysql2";
import { sqlOperations } from "../../../src/infrastructure/mysql/database-session.js";
import type { MysqlTestContext } from "../context.js";
import { jsonScoreRequest } from "./score-test-support.js";

type BiasRow = RowDataPacket &
  Readonly<{ readonly user_id: number; readonly total_point: number }>;

export async function runBiasCases(context: MysqlTestContext): Promise<void> {
  await context.seed();
  const invalidBias = await context.handle(
    jsonScoreRequest("/api/bias/date-init", "POST", {
      begin: "2026-09-02 09:00:00",
      end: "2026-09-01 09:00:00",
    }),
  );
  expect(invalidBias.status).toBe(400);
  const [totalsBeforeInvalid] = await context.rawPool.query<BiasRow[]>(
    "SELECT user_id, total_point FROM user_bias_total ORDER BY user_id",
  );
  expect(totalsBeforeInvalid.map(toTotal)).toEqual([
    { user_id: 1, total_point: -1 },
    { user_id: 2, total_point: 1 },
  ]);
  const rebuild = await context.handle(
    jsonScoreRequest("/api/bias/date-init", "POST", {
      begin: "2026-09-01 00:00:00",
      end: "2026-10-01 00:00:00",
    }),
  );
  expect(rebuild.status).toBe(200);
  expect(await rebuild.json()).toMatchObject({
    success: true,
    insertedCount: 3,
    range: {
      begin: "2026-08-31T15:00:00.000Z",
      end: "2026-09-30T15:00:00.000Z",
    },
  });
  const biasList = await context.handle(
    jsonScoreRequest("/api/bias/all", "GET"),
  );
  expect(biasList.status).toBe(200);
  const biasBody = await biasList.json();
  expect(biasBody).toMatchObject({ success: true, count: 3 });
  expect(biasBody.data).toEqual(
    expect.arrayContaining([
      {
        user_id: 1,
        jungol_name: "alpha",
        korean_name: "가나다",
        display_name: "alpha",
        total_point: -1,
        updated_at: expect.any(String),
      },
      {
        user_id: 2,
        jungol_name: "beta",
        korean_name: null,
        display_name: "beta",
        total_point: 0,
        updated_at: expect.any(String),
      },
      {
        user_id: 3,
        jungol_name: "ignored",
        korean_name: "무시",
        display_name: "ignored",
        total_point: 0,
        updated_at: expect.any(String),
      },
    ]),
  );
  for (const operation of [
    sqlOperations.biasLockUsers,
    sqlOperations.biasAggregate,
    sqlOperations.biasInsert,
    sqlOperations.biasList,
  ]) {
    expect(context.observedOperationIds.has(operation.id)).toBe(true);
  }
  await context.seed();
  const [oldTotals] = await context.rawPool.query<BiasRow[]>(
    "SELECT user_id, total_point FROM user_bias_total ORDER BY user_id",
  );
  await context.rawPool.query(
    "DROP TRIGGER IF EXISTS mysql_score_bias_bias_failure",
  );
  await context.rawPool.query(
    "CREATE TRIGGER mysql_score_bias_bias_failure BEFORE INSERT ON user_bias_total FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced bias insert failure'",
  );
  try {
    const failedRebuild = await context.handle(
      jsonScoreRequest("/api/bias/date-init", "POST", {
        begin: "2026-09-01 00:00:00",
        end: "2026-10-01 00:00:00",
      }),
    );
    expect(failedRebuild.status).toBe(503);
    const [totalsAfterFailure] = await context.rawPool.query<BiasRow[]>(
      "SELECT user_id, total_point FROM user_bias_total ORDER BY user_id",
    );
    expect(totalsAfterFailure.map(toTotal)).toEqual(oldTotals.map(toTotal));
  } finally {
    await context.rawPool.query(
      "DROP TRIGGER IF EXISTS mysql_score_bias_bias_failure",
    );
  }

  await context.seed();
  await context.rawPool.query("DELETE FROM score_history");
  const allZeroRebuild = await context.handle(
    jsonScoreRequest("/api/bias/date-init", "POST", {
      begin: "2026-09-01 00:00:00",
      end: "2026-10-01 00:00:00",
    }),
  );
  expect(allZeroRebuild.status).toBe(200);
  const [allZeroTotals] = await context.rawPool.query<BiasRow[]>(
    "SELECT user_id, total_point FROM user_bias_total ORDER BY user_id",
  );
  expect(allZeroTotals.map(toTotal)).toEqual([
    { user_id: 1, total_point: 0 },
    { user_id: 2, total_point: 0 },
    { user_id: 3, total_point: 0 },
  ]);

  await context.seed();
  try {
    await context.rawPool.query("SET FOREIGN_KEY_CHECKS = 0");
    await context.rawPool.query("DELETE FROM user");
    await context.rawPool.query("SET FOREIGN_KEY_CHECKS = 1");
    const emptyUserRebuild = await context.handle(
      jsonScoreRequest("/api/bias/date-init", "POST", {
        begin: "2026-09-01 00:00:00",
        end: "2026-10-01 00:00:00",
      }),
    );
    expect(emptyUserRebuild.status).toBe(200);
    expect(await emptyUserRebuild.json()).toMatchObject({
      success: true,
      insertedCount: 0,
    });
  } finally {
    await context.seed();
  }
}

function toTotal(row: BiasRow): {
  readonly user_id: number;
  readonly total_point: number;
} {
  return { user_id: row.user_id, total_point: row.total_point };
}
