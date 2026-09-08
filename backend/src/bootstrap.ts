import "dotenv/config";
import type { Pool } from "mysql2/promise";
import {
  type BackendConfig,
  BackendConfigLoader,
} from "./config/backend-config.js";
import {
  BackendEmergencyWebhook,
  EmergencyIncidentReporter,
  type InternalIncidentReporter,
} from "./emergency-webhook.js";

/** 프로세스 시작만 담당해 import 시 연결·listen이 발생하지 않도록 하는 명시적 조립 경계다. */
export type BootstrapDependencies = Readonly<{
  readonly loadConfig: () => BackendConfig;
  readonly initializeDatabase: (config: BackendConfig) => Promise<Pool>;
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
    (await import("./db/database.js")).initializeDatabase;
  try {
    await initializeDatabase(config);
  } catch (error) {
    await reporter.report({
      code: "database_initialization_failed",
      occurredAt: new Date(),
      operationId: "bootstrap.database_initialize",
    });
    throw error;
  }
  const [{ createApplication }, { getDatabase }] = await Promise.all([
    import("./index.js"),
    import("./db/database.js"),
  ]);
  return createApplication({
    getDatabase,
    incidentReporter: reporter,
  });
}
