import "dotenv/config";
import { AdminAuthenticator } from "./auth.js";
import {
  type BojRuntimeSources,
  createBojRuntime,
  hasBojIngestionSchema,
} from "./boj/runtime.js";
import {
  type BackendConfig,
  BackendConfigLoader,
} from "./config/backend-config.js";
import {
  BackendEmergencyWebhook,
  EmergencyIncidentReporter,
  type InternalIncidentReporter,
} from "./emergency-webhook.js";
import type {
  InitializedDatabase,
  initializeDatabase as openDatabase,
} from "./infrastructure/mysql/pool-factory.js";
import type { Clock } from "./infrastructure/time.js";

/** 프로세스 시작만 담당해 import 시 연결·listen이 발생하지 않도록 하는 명시적 조립 경계다. */
export type BootstrapDependencies = Readonly<{
  readonly clock: Clock;
  readonly loadConfig: () => BackendConfig;
  readonly initializeDatabase: typeof openDatabase;
  readonly bojSources?: BojRuntimeSources;
  readonly createReporter: (
    webhookUrl: string | undefined,
  ) => InternalIncidentReporter;
}>;
export async function bootstrap(
  dependencies: Partial<BootstrapDependencies> = {},
) {
  const config =
    dependencies.loadConfig?.() ?? new BackendConfigLoader().load(process.env);
  const reporter =
    dependencies.createReporter?.(config.WEBHOOK_URL) ??
    new EmergencyIncidentReporter(
      new BackendEmergencyWebhook(config.WEBHOOK_URL),
    );
  const initializeDatabase =
    dependencies.initializeDatabase ??
    (await import("./infrastructure/mysql/pool-factory.js")).initializeDatabase;
  let database: InitializedDatabase | undefined;
  let bojEnabled = false;
  try {
    database = await initializeDatabase(config);
    bojEnabled =
      config.DB_NAME === "boj_bada" &&
      (await hasBojIngestionSchema(database.pool));
  } catch (error) {
    await Promise.allSettled([database?.close()]);
    await reporter.report({
      code: "database_initialization_failed",
      occurredAt: new Date(),
      operationId: "bootstrap.database_initialize",
    });
    throw error;
  }
  const { createApplication } = await import("./index.js");
  const {
    SOLVED_AC_CLIENT_ID: clientId,
    SOLVED_AC_CLIENT_SECRET: clientSecret,
  } = config;
  const credentials =
    clientId && clientSecret ? { clientId, clientSecret } : undefined;
  const boj = bojEnabled
    ? createBojRuntime(database, credentials, dependencies.bojSources, reporter)
    : undefined;
  return {
    app: createApplication({
      databasePool: database.pool,
      authorizer: new AdminAuthenticator(config.JWT_SECRET),
      incidentReporter: reporter,
      clock: dependencies.clock,
      config,
    }),
    boj,
    async close() {
      await database.close();
    },
  };
}
