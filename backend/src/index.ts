import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { createHealthRoute } from "./api/health.js";
import { getDatabase } from "./db/database.js";
import {
  BackendEmergencyWebhook,
  EmergencyIncidentReporter,
  type InternalIncidentReporter,
  isEmergencyServerError,
} from "./emergency-webhook.js";
import {
  ClientInputError,
  DatabaseContractError,
  DatabaseQueryError,
  DatabaseTransactionError,
} from "./infrastructure/errors.js";
import { logger } from "./logger.js";

export { logger };

import { event } from "./api/event/event.js";
import { hook } from "./api/hook/hook.js";
import { rank } from "./api/rank.js";
import { board } from "./api/ranking_boards/board.js";
import { lastMonthBoard } from "./api/ranking_boards/selected-month-board.js";
import { topGainers } from "./api/ranking_boards/top-gainers.js";
import { userRankHistory } from "./api/ranking_boards/user-rank-history.js";
import { scoreHistory } from "./api/score_history/ScoreHistory.js";
import { userScoreHistory } from "./api/score_history/user.js";
// API 플러그인들
import { monthlyStats } from "./api/statistics/monthly-stats.js";
import { recentlyScore } from "./api/statistics/recently-score.js";
import { recentlySolve } from "./api/statistics/recently-solve.js";
import { users } from "./api/user/User.js";
import { userMonthly } from "./api/user/monthly.js";
import { userProblems } from "./api/user/problems.js";
import { userSearch } from "./api/user/search.js";
import { bias } from "./api/user_total_bias/Bias.js";

/** 앱 조립 시 외부 I/O와 장애 보고를 교체할 수 있게 하는 의존성 경계다. */
export type ApplicationDependencies = Readonly<{
  readonly getDatabase: typeof getDatabase;
  readonly incidentReporter: InternalIncidentReporter;
}>;

function createDefaultDependencies(): ApplicationDependencies {
  return {
    getDatabase,
    incidentReporter: new EmergencyIncidentReporter(
      new BackendEmergencyWebhook(process.env.WEBHOOK_URL),
    ),
  };
}

function createCorsConfig() {
  const isProduction = process.env.NODE_ENV === "production";
  const allowedOrigins = [process.env.ALLOWED_ORIGIN].filter(
    (origin): origin is string => origin !== undefined,
  );
  return isProduction
    ? {
        origin: allowedOrigins,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-Requested-With",
          "Cookie",
        ],
      }
    : {
        origin: true,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-Requested-With",
          "Cookie",
        ],
      };
}

function shouldReportIncident(code: string | number, error: unknown): boolean {
  if (error instanceof ClientInputError) return false;
  return (
    isEmergencyServerError(code) ||
    error instanceof DatabaseQueryError ||
    error instanceof DatabaseContractError ||
    error instanceof DatabaseTransactionError
  );
}

function incidentCode(error: unknown): string {
  if (
    error instanceof DatabaseQueryError ||
    error instanceof DatabaseContractError ||
    error instanceof DatabaseTransactionError
  )
    return error.code;
  return "http_request_failed";
}

// API 플러그인 배열
const apiPlugins = [
  rank,
  monthlyStats,
  recentlySolve,
  recentlyScore,
  event,
  board,
  scoreHistory,
  users,
  bias,
  userSearch,
  userScoreHistory,
  userProblems,
  userRankHistory,
  topGainers,
  lastMonthBoard,
  userMonthly,
  hook,
];

/** import 시 listen하지 않고, 안전한 incident context만 경보 경계로 전달하는 앱 factory다. */
export function createApplication(
  dependencies: ApplicationDependencies = createDefaultDependencies(),
) {
  const corsConfig = createCorsConfig();
  const app = new Elysia()
    .use(cors(corsConfig))
    .onRequest(({ request, set }) => {
      const isProduction = process.env.NODE_ENV === "production";
      const allowedOrigins = [process.env.ALLOWED_ORIGIN].filter(
        (origin): origin is string => origin !== undefined,
      );
      // Origin 체크 (프로덕션에서만)
      if (isProduction) {
        const origin = request.headers.get("origin");

        // Origin이 있고 허용되지 않은 경우 차단
        if (origin && !allowedOrigins.includes(origin)) {
          logger.warn(`차단된 Origin 접근 시도: ${origin}`);
          set.status = 403;
          return {
            error: "Origin not allowed",
            message: "허용되지 않은 Origin에서의 접근입니다.",
          };
        }

        // 허용된 Origin이면 CORS 헤더 설정
        if (origin && allowedOrigins.includes(origin)) {
          set.headers["Access-Control-Allow-Origin"] = origin;
          set.headers["Access-Control-Allow-Methods"] =
            "GET, POST, PUT, DELETE, OPTIONS";
          set.headers["Access-Control-Allow-Headers"] =
            "Content-Type, Authorization, X-Requested-With, Cookie";
          set.headers["Access-Control-Allow-Credentials"] = "true";
        }
      }

      logger.info(`요청 수신: ${request.method} ${request.url}`);
      logger.debug(`Origin: ${request.headers.get("origin")}`);
      logger.debug(`User-Agent: ${request.headers.get("user-agent")}`);
    })
    .onError(async ({ code, error, request }) => {
      const context = {
        err: error,
        method: request.method,
        path: new URL(request.url).pathname,
        code,
      };
      if (isEmergencyServerError(code))
        logger.error(context, "backend.request_failed");
      else logger.warn(context, "backend.request_rejected");
      if (!shouldReportIncident(code, error)) return;
      const codeForIncident = incidentCode(error);
      try {
        await dependencies.incidentReporter.report({
          code: codeForIncident,
          occurredAt: new Date(),
          operationId: `http.error.${codeForIncident}`,
          routeTemplate: "http.error",
        });
      } catch {
        logger.warn(
          { incidentCode: codeForIncident },
          "backend.incident_report_failed",
        );
      }
    })
    .use(
      swagger({
        documentation: {
          info: {
            title: "ANABADA Backend API",
            version: "1.0.0",
            description: "ANABADA 프로젝트 백엔드 API 서버",
          },
          tags: [
            { name: "Health", description: "서버 상태 확인" },
            { name: "Auth", description: "인증 관련 API" },
            { name: "User", description: "사용자 관련 API" },
            { name: "Statistics", description: "통계 관련 API" },
            { name: "Event", description: "이벤트 관련 API" },
          ],
        },
      }),
    )
    .get("/", () => ({
      message: "Hello Elysia",
      timestamp: new Date().toISOString(),
      status: "running",
    }))
    .use(createHealthRoute(dependencies.getDatabase))
    .get("/api/version", () => ({
      version: "1.0.0",
      framework: "Elysia",
      runtime: "Bun",
    }));

  // API 플러그인들 등록
  for (const plugin of apiPlugins) app.use(plugin);
  return app;
}
