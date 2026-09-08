import type { Logger } from "pino";

import { MigrationCatalog } from "./catalog.js";
import { parseConfiguration } from "./config.js";
import { MigrationError, migrationErrorCodes } from "./errors.js";
import type { MigrationConnectionFactory } from "./repository.js";
import { MigrationRepository } from "./repository.js";
import { MigrationRunner } from "./runner.js";

/** CLI 입력, 구성 경계 및 마이그레이터 실행을 연결한다. */
export class MigrationApplication {
  public constructor(
    private readonly environment: Readonly<Record<string, string | undefined>>,
    private readonly migrationDirectory: string,
    private readonly logger: Logger,
    private readonly connectionFactory: MigrationConnectionFactory,
  ) {}

  public async run(arguments_: readonly string[]): Promise<void> {
    try {
      if (arguments_.length !== 1 || arguments_[0] !== "up") {
        throw new MigrationError(migrationErrorCodes.configurationInvalid);
      }
      const config = parseConfiguration(this.environment);
      const catalog = new MigrationCatalog(this.migrationDirectory);
      const repository = new MigrationRepository(
        config,
        this.connectionFactory,
      );
      await new MigrationRunner(repository, this.logger).run(
        await catalog.load(),
      );
      this.logger.info("migration.complete");
    } catch (error: unknown) {
      this.logFailure(error);
    }
  }

  private logFailure(error: unknown): void {
    const code =
      error instanceof MigrationError ? error.code : "unexpected_failure";
    this.logger.error({ code }, "migration.failed");
    process.exitCode = 1;
  }
}
