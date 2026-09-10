import { afterAll, beforeAll, expect, test } from "bun:test";
import type { RowDataPacket } from "mysql2";
import {
  allSqlOperationIds,
  sqlOperations,
} from "../../src/infrastructure/mysql/database-session.js";
import { UserRepository } from "../../src/infrastructure/mysql/repositories/user-repository.js";
import { runAdminAuthenticationCases } from "./cases/admin-auth-cases.js";
import { runAdminRankingBoardCases } from "./cases/admin-ranking-board-cases.js";
import { runEventHookCases } from "./cases/event-hook-cases.js";
import { runRankingCases } from "./cases/ranking-cases.js";
import { runScoreBiasCases } from "./cases/score-bias-cases.js";
import { runUserActivityCases } from "./cases/user-activity-cases.js";
import { type MysqlTestContext, createMysqlTestContext } from "./context.js";

let context: MysqlTestContext | undefined;
type FixtureCounts = RowDataPacket &
  Readonly<{
    readonly migration_count: number;
    readonly table_count: number;
    readonly user_count: number;
  }>;

beforeAll(async () => {
  context = await createMysqlTestContext();
  await context.seed();
});

afterAll(async () => {
  await context?.close();
});

test("Given migrated MySQL and deterministic fixture When calling root and health Then the real application is healthy", async () => {
  const activeContext = context;
  if (!activeContext) throw new Error("MySQL test context was not initialized");

  const [fixtureRows] = await activeContext.rawPool.query<FixtureCounts[]>(
    "SELECT (SELECT COUNT(*) FROM migrations WHERE version = 3) AS migration_count, (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'jungol_bada' AND table_name IN ('event', 'event_problem', 'hook', 'problem', 'ranking_boards', 'ranked_users', 'score_history', 'user', 'user_bias_total')) AS table_count, (SELECT COUNT(*) FROM user) AS user_count",
  );
  const root = await activeContext.handle(new Request("http://test/"));
  const version = await activeContext.handle(
    new Request("http://test/api/version"),
  );

  const fixtureCounts = fixtureRows.map((row) => ({
    migration_count: Number(row.migration_count),
    table_count: Number(row.table_count),
    user_count: Number(row.user_count),
  }));
  expect(fixtureCounts).toEqual([
    { migration_count: 1, table_count: 9, user_count: 3 },
  ]);
  expect(activeContext.observedOperationIds).toEqual(new Set());
  expect(await root.json()).toEqual({
    message: "Hello Elysia",
    timestamp: "2026-09-08T06:00:00.000Z",
    status: "running",
  });
  expect(await version.json()).toEqual({
    version: "1.0.0",
    framework: "Elysia",
    runtime: "Bun",
  });
  expect(activeContext.observedOperationIds).toEqual(new Set());

  const health = await activeContext.handle(new Request("http://test/health"));
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({
    status: "healthy",
    timestamp: "2026-09-08T06:00:00.000Z",
  });
  expect(activeContext.observedOperationIds).toEqual(
    new Set([
      sqlOperations.configureUtc.id,
      sqlOperations.healthReady.id,
      sqlOperations.healthMigrations.id,
      sqlOperations.healthTables.id,
    ]),
  );
});

test("Given a migrated database When every route family is driven through the real app Then all registered SQL and HTTP contracts are observed", async () => {
  const activeContext = context;
  if (!activeContext) throw new Error("MySQL test context was not initialized");

  await runUserActivityCases(activeContext);
  await runRankingCases(activeContext);
  await runScoreBiasCases(activeContext);
  await runEventHookCases(activeContext);
  await runAdminRankingBoardCases(activeContext);
  await runAdminAuthenticationCases(activeContext);

  const userExists = await activeContext.pool.withSession((session) =>
    new UserRepository(session).exists(1),
  );
  expect(userExists).toBe(true);

  const missingOperations = [...allSqlOperationIds].filter(
    (operationId) => !activeContext.observedOperationIds.has(operationId),
  );
  expect(missingOperations).toEqual([]);
  expect(activeContext.observedOperationIds.size).toBe(allSqlOperationIds.size);
  const expectedRouteCount = 47;
  expect(activeContext.observedRouteIds.size).toBe(expectedRouteCount);
  expect(activeContext.assertAllRoutesObserved()).toBe(true);
});
