import { expect, test } from "bun:test";
import { bootstrap } from "../src/bootstrap.js";
import type { BackendConfig } from "../src/config/backend-config.js";
import type {
  BackendEmergencyIncident,
  BackendEmergencyResult,
  InternalIncidentReporter,
} from "../src/emergency-webhook.js";
import { createApplication } from "../src/index.js";
import {
  ClientInputError,
  DatabaseContractError,
  DatabaseQueryError,
  DatabaseTransactionError,
} from "../src/infrastructure/errors.js";
import {
  type DatabaseConnection,
  type DatabaseConnectionPool,
  DatabasePool,
  type SqlParameter,
} from "../src/infrastructure/mysql/database-session.js";

const config: BackendConfig = {
  DB_HOST: "db",
  DB_PORT: 3306,
  DB_USER: "app",
  DB_PASSWORD: "database-secret",
  DB_NAME: "anabada",
  JWT_SECRET: "jwt-secret",
  NODE_ENV: "test",
  ALLOWED_ORIGIN: "http://localhost:3000",
  WEBHOOK_URL: undefined,
};

test("Given database initialization failure When bootstrapping Then reports one sanitized incident", async () => {
  const reporter = new RecordingReporter();
  const rawFailure = new Error("raw-database-password=database-secret");

  await expect(
    bootstrap({
      loadConfig: () => config,
      createReporter: () => reporter,
      initializeDatabase: async () => {
        throw rawFailure;
      },
    }),
  ).rejects.toBe(rawFailure);

  expect(reporter.incidents).toEqual([
    expect.objectContaining({
      code: "database_initialization_failed",
      operationId: "bootstrap.database_initialize",
    }),
  ]);
  expect(JSON.stringify(reporter.incidents)).not.toContain("database-secret");
  expect(JSON.stringify(reporter.incidents)).not.toContain(rawFailure.message);
});

test("Given configuration failure When bootstrapping Then does not create a reporter", async () => {
  let reporterFactoryCalls = 0;

  await expect(
    bootstrap({
      loadConfig: () => {
        throw new Error("invalid configuration");
      },
      createReporter: () => {
        reporterFactoryCalls += 1;
        return new RecordingReporter();
      },
      initializeDatabase: async () => {
        throw new Error("database initialization must not run");
      },
    }),
  ).rejects.toThrow("invalid configuration");

  expect(reporterFactoryCalls).toBe(0);
});

class RecordingReporter implements InternalIncidentReporter {
  readonly incidents: BackendEmergencyIncident[] = [];

  async report(
    incident: BackendEmergencyIncident,
  ): Promise<BackendEmergencyResult> {
    this.incidents.push(incident);
    return "delivered";
  }
}

function testDependencies(incidentReporter: InternalIncidentReporter) {
  return {
    databasePool: new DatabasePool(new EmptyPool()),
    authorizer: { isAdmin: () => false },
    incidentReporter,
    config: {
      NODE_ENV: "test" as const,
      ALLOWED_ORIGIN: "http://localhost:3000",
    },
  };
}

class EmptyPool implements DatabaseConnectionPool {
  async getConnection(): Promise<DatabaseConnection> {
    return new EmptyConnection();
  }
}

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

test("Given client input error When app handles it Then sends no incident", async () => {
  const reporter = new RecordingReporter();
  const app = createApplication(testDependencies(reporter));
  app.get("/__test/client-input", () => {
    throw new ClientInputError();
  });

  const response = await app.handle(
    new Request("http://localhost/__test/client-input"),
  );

  expect(response.status).toBe(400);
  expect(reporter.incidents).toHaveLength(0);
});

test("Given unexpected failure When app handles it Then reports exactly one safe HTTP incident", async () => {
  const reporter = new RecordingReporter();
  const app = createApplication(testDependencies(reporter));
  app.get("/__test/unexpected", () => {
    throw new Error("raw secret payload");
  });

  const response = await app.handle(
    new Request("http://localhost/__test/unexpected?secret=not-for-alert"),
  );

  expect(response.status).toBe(500);
  expect(reporter.incidents).toEqual([
    expect.objectContaining({
      code: "http_request_failed",
      operationId: "http.error.http_request_failed",
      routeTemplate: "GET /__test/unexpected",
    }),
  ]);
  expect(JSON.stringify(reporter.incidents)).not.toContain(
    "raw secret payload",
  );
});

test("Given database infrastructure errors When app handles them Then reports each exactly once", async () => {
  const reporter = new RecordingReporter();
  const app = createApplication(testDependencies(reporter));
  app.get("/__test/database-query", () => {
    throw new DatabaseQueryError("query.secret_safe");
  });
  app.get("/__test/database-contract", () => {
    throw new DatabaseContractError("contract.secret_safe");
  });
  app.get("/__test/database-transaction", () => {
    throw new DatabaseTransactionError("transaction.secret_safe");
  });

  await app.handle(
    new Request("http://localhost/__test/database-query?secret=not-for-alert"),
  );
  await app.handle(new Request("http://localhost/__test/database-contract"));
  await app.handle(new Request("http://localhost/__test/database-transaction"));

  expect(reporter.incidents.map((incident) => incident.code)).toEqual([
    "database_query_failed",
    "database_contract_invalid",
    "database_transaction_failed",
  ]);
  expect(reporter.incidents).toHaveLength(3);
  expect(reporter.incidents.map((incident) => incident.operationId)).toEqual([
    "query.secret_safe",
    "contract.secret_safe",
    "transaction.secret_safe",
  ]);
  expect(
    reporter.incidents.every(
      (incident, index) =>
        incident.routeTemplate ===
        [
          "GET /__test/database-query",
          "GET /__test/database-contract",
          "GET /__test/database-transaction",
        ][index],
    ),
  ).toBe(true);
  expect(JSON.stringify(reporter.incidents)).not.toContain("not-for-alert");
});
