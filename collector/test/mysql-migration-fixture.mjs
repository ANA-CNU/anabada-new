import { createConnection } from "mysql2/promise";
import pino from "pino";
import { MigrationCatalog } from "../../migrations/src/catalog.js";
import { MigrationRepository } from "../../migrations/src/repository.js";
import { MigrationRunner } from "../../migrations/src/runner.js";

const host = process.env.MYSQL_TEST_HOST;
const port = Number(process.env.MYSQL_TEST_PORT);
const password = process.env.MYSQL_TEST_PASSWORD;

if (!host || !Number.isInteger(port) || !password) {
  throw new Error(
    "MySQL integration fixture requires explicit test connection values",
  );
}

const factory = {
  async create() {
    const connection = await createConnection({
      host,
      port,
      user: "root",
      password,
      multipleStatements: true,
      timezone: "Z",
    });
    return {
      async query(sql, parameters) {
        return connection.query(sql, parameters);
      },
      async execute(sql, parameters) {
        await connection.execute(sql, parameters);
      },
      async end() {
        await connection.end();
      },
    };
  },
};

const catalog = await new MigrationCatalog(
  new URL("../../migrations/", import.meta.url).pathname,
).load();
const repository = new MigrationRepository(
  {
    host: "anabada-mysql",
    port: 3306,
    user: "root",
    database: "jungol_bada",
    password,
  },
  factory,
);
await new MigrationRunner(repository, pino({ enabled: false })).run(catalog);
