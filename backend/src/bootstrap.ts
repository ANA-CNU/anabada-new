import "dotenv/config";
import { AdminAuthenticator } from "./auth.js";
import {
  type BackendConfig,
  BackendConfigLoader,
} from "./config/backend-config.js";
import {
  BackendEmergencyWebhook,
  EmergencyIncidentReporter,
  type InternalIncidentReporter,
} from "./emergency-webhook.js";
import type { InitializedDatabase } from "./infrastructure/mysql/pool-factory.js";

/** 프로세스 시작만 담당해 import 시 연결·listen이 발생하지 않도록 하는 명시적 조립 경계다. */
export type BootstrapDependencies = Readonly<{
  readonly loadConfig: () => BackendConfig;
  readonly initializeDatabase: (
    config: BackendConfig,
  ) => Promise<InitializedDatabase>;
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
  let database: InitializedDatabase;
  try {
    database = await initializeDatabase(config);
  } catch (error) {
    await reporter.report({
      code: "database_initialization_failed",
      occurredAt: new Date(),
      operationId: "bootstrap.database_initialize",
    });
    throw error;
  }
  const { createApplication } = await import("./index.js");
  return {
    app: createApplication({
      databasePool: database.pool,
      authorizer: new AdminAuthenticator(config.JWT_SECRET),
      incidentReporter: reporter,
      config,
    }),
    close: database.close,
  };
}
