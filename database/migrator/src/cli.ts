import { fileURLToPath } from "node:url";

import { MigrationApplication } from "./application.js";
import { createLogger } from "./logger.js";
import { MysqlMigrationConnectionFactory } from "./repository.js";

const migrationDirectory = fileURLToPath(
  new URL("../../../migrations/", import.meta.url),
);
const application = new MigrationApplication(
  process.env,
  migrationDirectory,
  createLogger(),
  new MysqlMigrationConnectionFactory(),
);

void application.run(process.argv.slice(2));
