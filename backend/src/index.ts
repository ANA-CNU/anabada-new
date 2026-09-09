import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { AdminRankingBoardService } from "./api/admin/ranking-board-service.js";
import { createAdminRankingBoardRoutes } from "./api/admin/ranking-boards.js";
import { EventService } from "./api/event/event-service.js";
import { createEventRoute } from "./api/event/event.js";
import { BoundedHealthTimeout, createHealthRoute } from "./api/health.js";
import { createHookRoutes } from "./api/hook/hook.js";
import { createRankingRoutes } from "./api/rank.js";
import {
  type ScoreHistoryRouteDependencies,
  createScoreHistoryRoutes,
} from "./api/score_history/ScoreHistory.js";
import { ScoreHistoryService } from "./api/score_history/score-history-service.js";
import { createStatisticsRoutes } from "./api/statistics/monthly-stats.js";
import { createActivityRoutes } from "./api/statistics/recently-solve.js";
import { UserService, createUserRoutes } from "./api/user/User.js";
import { createUserMonthlyRoutes } from "./api/user/monthly.js";
import { createUserProblemRoutes } from "./api/user/problems.js";
import { createUserSearchRoutes } from "./api/user/search.js";
import { createBiasRoutes } from "./api/user_total_bias/Bias.js";
import { BiasService } from "./api/user_total_bias/bias-service.js";
import type { AdminAuthorizer } from "./auth.js";
import type { BackendConfig } from "./config/backend-config.js";
import type { InternalIncidentReporter } from "./emergency-webhook.js";
import {
  ClientInputError,
  DatabaseContractError,
  DatabaseQueryError,
  DatabaseTransactionError,
} from "./infrastructure/errors.js";
import type { DatabasePool } from "./infrastructure/mysql/database-session.js";
import { ActivityRepository } from "./infrastructure/mysql/repositories/activity-repository.js";
import { EventRepository } from "./infrastructure/mysql/repositories/event-repository.js";
import { HealthRepository } from "./infrastructure/mysql/repositories/health-repository.js";
import { RankingRepository } from "./infrastructure/mysql/repositories/ranking-repository.js";
import { UserRepository } from "./infrastructure/mysql/repositories/user-repository.js";
import { type Clock, KstCalendar, SystemClock } from "./infrastructure/time.js";
import { logger } from "./logger.js";

export { logger };

export type ApplicationDependencies = Readonly<{
  readonly databasePool: DatabasePool;
  readonly authorizer: AdminAuthorizer;
  readonly incidentReporter: InternalIncidentReporter;
  readonly clock?: Clock;
  readonly calendar?: KstCalendar;
  readonly config: Pick<BackendConfig, "NODE_ENV" | "ALLOWED_ORIGIN">;
}>;

const json = (status: number, body: object): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function isInfrastructureError(
  error: unknown,
): error is
  | DatabaseQueryError
  | DatabaseContractError
  | DatabaseTransactionError {
  return (
    error instanceof DatabaseQueryError ||
    error instanceof DatabaseContractError ||
    error instanceof DatabaseTransactionError
  );
}

function incidentApi(request: Request): string {
  return `${request.method} ${new URL(request.url).pathname}`;
}

function sessionServices(pool: DatabasePool) {
  const withRepository = <T>(
    work: (repository: UserRepository) => Promise<T>,
  ) => pool.withSession((session) => work(new UserRepository(session)));
  const userService = new UserService({
    list: () => withRepository((repository) => repository.list()),
    find: (id) => withRepository((repository) => repository.find(id)),
    search: (term) => withRepository((repository) => repository.search(term)),
    update: (id, patch) =>
      withRepository((repository) => repository.update(id, patch)),
    remove: (id) => withRepository((repository) => repository.remove(id)),
  });
  const activities = {
    findUser: (id: number) =>
      withRepository((repository) => repository.find(id)),
    problemsForUser: (id: number) =>
      pool.withSession((session) =>
        new ActivityRepository(session).problemsForUser(id),
      ),
    monthlySummary: (
      id: number,
      start: Date,
      end: Date,
      startDate: string,
      endDate: string,
    ) =>
      pool.withSession((session) =>
        new ActivityRepository(session).monthlySummary(
          id,
          start,
          end,
          startDate,
          endDate,
        ),
      ),
    monthlyStats: (
      buckets: readonly import("./infrastructure/time.js").KstMonthBucket[],
    ) =>
      pool.withSession((session) =>
        new ActivityRepository(session).monthlyStats(buckets),
      ),
    totalProblems: () =>
      pool.withSession((session) =>
        new ActivityRepository(session).totalProblems(),
      ),
    recentlySolved: (limit: number, offset: number) =>
      pool.withSession((session) =>
        new ActivityRepository(session).recentlySolved(limit, offset),
      ),
  };
  return { userService, activities };
}

export function createApplication(dependencies: ApplicationDependencies) {
  const clock = dependencies.clock ?? new SystemClock();
  const calendar = dependencies.calendar ?? new KstCalendar();
  const { databasePool, authorizer, incidentReporter, config } = dependencies;
  const { userService, activities } = sessionServices(databasePool);
  const scoreService = new ScoreHistoryService(databasePool, databasePool);
  const biasService = new BiasService(databasePool, databasePool);
  const eventService = {
    unitOfWork: <T>(work: (repository: EventRepository) => Promise<T>) =>
      databasePool.unitOfWork((session) => work(new EventRepository(session))),
  };
  const eventReads = {
    withSession: <T>(work: (repository: EventRepository) => Promise<T>) =>
      databasePool.withSession((session) => work(new EventRepository(session))),
  };
  const scoreRoutes: ScoreHistoryRouteDependencies = {
    service: scoreService,
    authorize: (request) => authorizer.isAdmin(request),
  };
  const origins =
    config.NODE_ENV === "production" ? [config.ALLOWED_ORIGIN] : true;
  const app = new Elysia()
    .use(cors({ origin: origins, credentials: true }))
    .onRequest(({ request }) => {
      logger.info(
        { method: request.method, path: new URL(request.url).pathname },
        "backend.request_received",
      );
    })
    .onError(async ({ error, request, set }) => {
      if (error instanceof ClientInputError)
        return json(400, { error: "Invalid request" });
      const unavailable = isInfrastructureError(error);
      const status = unavailable ? 503 : 500;
      set.status = status;
      logger.error(
        {
          code: unavailable ? error.code : "http_request_failed",
          operationId: unavailable ? error.operationId : undefined,
          method: request.method,
          path: new URL(request.url).pathname,
        },
        "backend.request_failed",
      );
      try {
        await incidentReporter.report({
          code: unavailable ? error.code : "http_request_failed",
          occurredAt: clock.now(),
          operationId: unavailable
            ? error.operationId
            : "http.error.http_request_failed",
          routeTemplate: incidentApi(request),
        });
      } catch {
        logger.warn(
          { method: request.method, path: new URL(request.url).pathname },
          "backend.incident_report_failed",
        );
      }
      return json(status, {
        error: unavailable ? "Service unavailable" : "Internal server error",
      });
    })
    .use(
      swagger({
        documentation: {
          info: { title: "ANABADA Backend API", version: "1.0.0" },
        },
      }),
    )
    .get("/", () => ({
      message: "Hello Elysia",
      timestamp: clock.now().toISOString(),
      status: "running",
    }))
    .get("/api/version", () => ({
      version: "1.0.0",
      framework: "Elysia",
      runtime: "Bun",
    }))
    .use(
      createHealthRoute(
        {
          check: () =>
            databasePool.withSession((session) =>
              new HealthRepository(session).check(),
            ),
        },
        clock,
        incidentReporter,
        new BoundedHealthTimeout(),
      ),
    )
    .use(
      createEventRoute({
        service: new EventService(eventService, calendar),
        reads: eventReads,
        authorizer,
      }),
    )
    .use(
      createUserRoutes({
        service: userService,
        adminAuthorizer: {
          authorize: (request) => authorizer.isAdmin(request),
        },
      }),
    )
    .use(createUserSearchRoutes(userService))
    .use(createUserProblemRoutes(activities))
    .use(createUserMonthlyRoutes({ service: activities, calendar, clock }))
    .use(createActivityRoutes(activities))
    .use(createStatisticsRoutes({ service: activities, calendar, clock }))
    .use(
      createRankingRoutes({
        withRepository: (work) =>
          databasePool.withSession((session) =>
            work(new RankingRepository(session)),
          ),
        clock,
        calendar,
      }),
    )
    .use(
      createAdminRankingBoardRoutes({
        withRepository: (work) =>
          databasePool.withSession((session) =>
            work(new RankingRepository(session)),
          ),
        service: new AdminRankingBoardService({
          unitOfWork: (work) =>
            databasePool.unitOfWork((session) =>
              work(new RankingRepository(session)),
            ),
        }),
        authorizer,
      }),
    )
    .use(createScoreHistoryRoutes(scoreRoutes))
    .use(
      createBiasRoutes({
        service: biasService,
        authorize: (request) => authorizer.isAdmin(request),
      }),
    )
    .use(
      createHookRoutes({
        withSession: (work) =>
          databasePool.withSession((session) => work(session)),
        authorizer: (request) => authorizer.isAdmin(request),
      }),
    );
  return app;
}
