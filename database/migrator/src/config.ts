import { z } from "zod";

import { MigrationError, migrationErrorCodes } from "./errors.js";

const environmentSchema = z.object({
  DB_PASSWORD: z.string().min(1),
});

/** DB 연결에 쓰이는 유일한 외부 입력 경계다. */
export type MigrationConfiguration = Readonly<{
  host: "anabada-mysql";
  port: 3306;
  user: "root";
  database: "jungol_bada";
  password: string;
}>;

/** 환경 변수에서 비밀값만 읽고, 연결 대상은 고정값으로 구성한다. */
export function parseConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): MigrationConfiguration {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new ConfigurationError();
  }
  return {
    host: "anabada-mysql",
    port: 3306,
    user: "root",
    database: "jungol_bada",
    password: parsed.data.DB_PASSWORD,
  };
}

/** 환경 입력이 마이그레이터 실행 조건을 만족하지 않을 때 발생한다. */
export class ConfigurationError extends MigrationError {
  public constructor() {
    super(migrationErrorCodes.configurationInvalid);
    this.name = "ConfigurationError";
  }
}
