import type { Pool } from "mysql2/promise";
import { AdminAuthenticator } from "../../src/auth.js";
import type { BackendConfig } from "../../src/config/backend-config.js";
import type {
  BackendEmergencyIncident,
  BackendEmergencyResult,
  InternalIncidentReporter,
} from "../../src/emergency-webhook.js";
import { createApplication } from "../../src/index.js";
import {
  type SqlOperationId,
  type SqlOperationObserver,
  allSqlOperationIds,
} from "../../src/infrastructure/mysql/database-session.js";
import {
  type InitializedDatabase,
  initializeDatabase,
} from "../../src/infrastructure/mysql/pool-factory.js";
import { type Clock, KstCalendar } from "../../src/infrastructure/time.js";
import { SeedDatabase } from "./seed-database.js";

const fixedTime = new Date("2026-09-08T06:00:00.000Z");

class FixedClock implements Clock {
  now(): Date {
    return new Date(fixedTime);
  }
}

class RecordingObserver implements SqlOperationObserver {
  readonly ids = new Set<SqlOperationId>();
  observe(operationId: SqlOperationId): void {
    this.ids.add(operationId);
  }
}

class RecordingIncidentReporter implements InternalIncidentReporter {
  readonly incidents: BackendEmergencyIncident[] = [];

  async report(
    incident: BackendEmergencyIncident,
  ): Promise<BackendEmergencyResult> {
    this.incidents.push(incident);
    return "delivered";
  }

  clear(): void {
    this.incidents.splice(0, this.incidents.length);
  }
}

const allRouteIds: ReadonlySet<string> = new Set([
  "GET /",
  "GET /api/version",
  "GET /health",
  "GET /api/hooks",
  "GET /api/hooks/:id",
  "POST /api/hooks",
  "PUT /api/hooks/:id",
  "DELETE /api/hooks/:id",
  "PATCH /api/hooks/:id/toggle",
  "GET /api/events/ongoing",
  "GET /api/events/past",
  "GET /api/events",
  "GET /api/events/:id",
  "POST /api/event/create",
  "PUT /api/events/:id",
  "DELETE /api/events/:id",
  "POST /api/bias/date-init",
  "GET /api/bias/all",
  "POST /api/score-history/bulk",
  "GET /api/admin/score-history",
  "PUT /api/score-history/:id",
  "DELETE /api/score-history/:id",
  "GET /api/users/all",
  "GET /api/users/:id",
  "PUT /api/users/:id",
  "DELETE /api/users/:id",
  "GET /api/user/:userId/problems",
  "GET /api/user/search",
  "GET /api/user/:userId/monthly-summary",
  "GET /api/ranking/solved",
  "GET /api/ranking/monthly-solved",
  "GET /api/ranking/bias",
  "GET /api/v2/ranking/bias",
  "GET /api/board/latest",
  "GET /api/board/recently-date",
  "GET /api/board/top-gainers",
  "GET /api/board/user/:userId/rank-history",
  "GET /api/ranking/selected-month-board",
  "GET /api/statistics/recently-score",
  "GET /api/statistics/recently-score/top",
  "GET /api/score_history/user/:userId",
  "GET /api/statistics/recently-solved",
  "GET /api/statistics/monthly-problems",
  "GET /api/statistics/total-problems",
] as const);

function routeId(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const template = pathname
    .replace(/^\/api\/hooks\/\d+\/toggle$/, "/api/hooks/:id/toggle")
    .replace(/^\/api\/(?:hooks|events|score-history|users)\/\d+$/, (path) =>
      path.replace(/\d+$/, ":id"),
    )
    .replace(
      /^\/api\/board\/user\/\d+\/rank-history$/,
      "/api/board/user/:userId/rank-history",
    )
    .replace(
      /^\/api\/score_history\/user\/\d+$/,
      "/api/score_history/user/:userId",
    )
    .replace(
      /^\/api\/user\/\d+\/(problems|monthly-summary)$/,
      "/api/user/:userId/$1",
    );
  return `${request.method} ${template}`;
}

const testConfig = (): BackendConfig => ({
  DB_HOST: process.env.DB_HOST ?? "anabada-mysql",
  DB_PORT: Number(process.env.DB_PORT ?? "3306"),
  DB_USER: process.env.DB_USER ?? "root",
  DB_PASSWORD: process.env.DB_PASSWORD ?? "",
  DB_NAME: process.env.DB_NAME ?? "jungol_bada",
  NODE_ENV: "test",
  JWT_SECRET: process.env.JWT_SECRET ?? "integration-test-jwt-secret",
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN ?? "http://integration.test",
  WEBHOOK_URL: undefined,
});

export type MysqlTestContext = Readonly<{
  readonly app: ReturnType<typeof createApplication>;
  readonly pool: InitializedDatabase["pool"];
  readonly rawPool: Pool;
  readonly seed: () => Promise<void>;
  readonly handle: (request: Request) => Promise<Response>;
  readonly handleUnauthenticated: (request: Request) => Promise<Response>;
  readonly observedOperationIds: ReadonlySet<SqlOperationId>;
  readonly assertAllOperationsObserved: () => boolean;
  readonly observedRouteIds: ReadonlySet<string>;
  readonly assertAllRoutesObserved: () => boolean;
  readonly incidents: readonly BackendEmergencyIncident[];
  readonly clearIncidents: () => void;
  readonly close: () => Promise<void>;
}>;

export async function createMysqlTestContext(): Promise<MysqlTestContext> {
  const observer = new RecordingObserver();
  const database = await initializeDatabase(testConfig(), observer);
  const reporter = new RecordingIncidentReporter();
  const app = createApplication({
    databasePool: database.pool,
    authorizer: { isAdmin: () => true },
    incidentReporter: reporter,
    clock: new FixedClock(),
    calendar: new KstCalendar(),
    config: { NODE_ENV: "test", ALLOWED_ORIGIN: testConfig().ALLOWED_ORIGIN },
  });
  const unauthenticatedApp = createApplication({
    databasePool: database.pool,
    authorizer: new AdminAuthenticator(testConfig().JWT_SECRET),
    incidentReporter: reporter,
    clock: new FixedClock(),
    calendar: new KstCalendar(),
    config: { NODE_ENV: "test", ALLOWED_ORIGIN: testConfig().ALLOWED_ORIGIN },
  });
  const routes = new Set<string>();
  return {
    app,
    pool: database.pool,
    rawPool: database.rawPool,
    seed: () => new SeedDatabase(database.rawPool).resetAndSeed(),
    handle: async (request) => {
      const id = routeId(request);
      if (allRouteIds.has(id)) routes.add(id);
      return app.handle(request);
    },
    handleUnauthenticated: (request) => unauthenticatedApp.handle(request),
    observedOperationIds: observer.ids,
    assertAllOperationsObserved: () =>
      [...allSqlOperationIds].every((operationId) =>
        observer.ids.has(operationId),
      ),
    observedRouteIds: routes,
    assertAllRoutesObserved: () =>
      [...allRouteIds].every((route) => routes.has(route)),
    incidents: reporter.incidents,
    clearIncidents: () => reporter.clear(),
    close: database.close,
  };
}
