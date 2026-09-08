import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const webhookUrl = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional()
  .pipe(
    z
      .string()
      .url()
      .refine((value) => {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      }, "WEBHOOK_URL must use http or https")
      .optional(),
  );
const baseSchema = z.object({
  DB_HOST: nonEmpty,
  DB_PORT: z.coerce.number().int().min(1).max(65535),
  DB_USER: nonEmpty,
  DB_PASSWORD: z.string(),
  DB_NAME: nonEmpty,
  JWT_SECRET: nonEmpty,
  NODE_ENV: z.enum(["development", "test", "stage", "production"]),
  ALLOWED_ORIGIN: z.string().url(),
  WEBHOOK_URL: webhookUrl,
});

export type BackendConfig = Readonly<z.infer<typeof baseSchema>>;
export type Environment = Readonly<Record<string, string | undefined>>;
export type RuntimeEnvironment = BackendConfig["NODE_ENV"];
export function isOperationalEnvironment(
  environment: RuntimeEnvironment,
): boolean {
  return environment !== "development" && environment !== "test";
}

/** 환경 변수는 신뢰할 수 없는 입력이므로 시작 경계에서 한 번만 파싱한다. 비밀값은 오류에 포함하지 않는다. */
export class BackendConfigLoader {
  load(environment: Environment): BackendConfig {
    const parsed = baseSchema
      .superRefine((value, context) => {
        if (
          isOperationalEnvironment(value.NODE_ENV) &&
          value.DB_PASSWORD.length === 0
        )
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["DB_PASSWORD"],
            message: "DB_PASSWORD is required",
          });
      })
      .safeParse(environment);
    if (parsed.success) return parsed.data;
    throw new BackendConfigError(
      parsed.error.issues.map((issue) => issue.path.join(".")).join(", "),
    );
  }
  createForTest(environment: Environment): BackendConfig {
    const parsed = baseSchema.safeParse({ ...environment, NODE_ENV: "test" });
    if (parsed.success) return parsed.data;
    throw new BackendConfigError(
      parsed.error.issues.map((issue) => issue.path.join(".")).join(", "),
    );
  }
}
export class BackendConfigError extends Error {
  readonly name = "BackendConfigError";
  constructor(readonly invalidFields: string) {
    super(`Invalid backend configuration fields: ${invalidFields}`);
  }
}
