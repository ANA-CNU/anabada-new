import { expect, test } from "bun:test";
import { createApplication } from "../src/index.js";
import {
  type DatabaseConnection,
  type DatabaseConnectionPool,
  DatabasePool,
  type SqlParameter,
} from "../src/infrastructure/mysql/database-session.js";

const expectedRoutes = [
  "GET /",
  "GET /api/version",
  "GET /health",
  "GET /api/events/ongoing",
  "GET /api/events/past",
  "GET /api/events",
  "GET /api/events/:id",
  "POST /api/event/create",
  "PUT /api/events/:id",
  "DELETE /api/events/:id",
  "GET /api/users/all",
  "GET /api/users/:id",
  "PUT /api/users/:id",
  "DELETE /api/users/:id",
  "GET /api/user/search",
  "GET /api/user/:userId/problems",
  "GET /api/user/:userId/monthly-summary",
  "GET /api/statistics/recently-solved",
  "GET /api/statistics/monthly-problems",
  "GET /api/statistics/total-problems",
  "GET /api/statistics/recently-score",
  "GET /api/statistics/recently-score/top",
  "GET /api/ranking/solved",
  "GET /api/ranking/monthly-solved",
  "GET /api/ranking/bias",
  "GET /api/v2/ranking/bias",
  "GET /api/ranking/selected-month-board",
  "GET /api/board/latest",
  "GET /api/board/recently-date",
  "GET /api/board/top-gainers",
  "GET /api/board/user/:userId/rank-history",
  "GET /api/score_history/user/:userId",
  "POST /api/score-history/bulk",
  "GET /api/admin/score-history",
  "PUT /api/score-history/:id",
  "DELETE /api/score-history/:id",
  "POST /api/bias/date-init",
  "GET /api/bias/all",
  "GET /api/hooks",
  "GET /api/hooks/:id",
  "POST /api/hooks",
  "PUT /api/hooks/:id",
  "DELETE /api/hooks/:id",
  "PATCH /api/hooks/:id/toggle",
] as const;

class EmptyConnection implements DatabaseConnection {
  async query(_options: {
    readonly sql: string;
    readonly values: readonly SqlParameter[];
    readonly timeout: number;
  }): Promise<readonly [unknown, unknown]> {
    return [[], []];
  }
  async beginTransaction(): Promise<void> {}
  async commit(): Promise<void> {}
  async rollback(): Promise<void> {}
  release(): void {}
  destroy(): void {}
}

test("Given the application graph When registering routes Then its canonical inventory has 44 endpoints", () => {
  const databasePool = new DatabasePool({
    getConnection: async () => new EmptyConnection(),
  } satisfies DatabaseConnectionPool);
  const app = createApplication({
    databasePool,
    authorizer: { isAdmin: () => false },
    incidentReporter: { report: async () => "disabled" },
    config: { NODE_ENV: "test", ALLOWED_ORIGIN: "http://localhost:3000" },
  });
  const actualRoutes = app.routes
    .map((route) => `${route.method} ${route.path}`)
    .filter((route) =>
      expectedRoutes.includes(route as (typeof expectedRoutes)[number]),
    )
    .sort();
  expect(actualRoutes).toEqual([...expectedRoutes].sort());
  expect(actualRoutes).toHaveLength(44);
});
