import { pino } from "pino";
import { AccountFlowFailure } from "./application/flow-log.js";
import { BoundaryError } from "./errors.js";
import { JungolError } from "./jungol/errors.js";
import { PersistenceError } from "./mysql/account-types.js";
import { LeaseError } from "./mysql/lease.js";
import { WorkerPoolError } from "./worker-pool.js";

/** 외부 로그에 예외 메시지나 응답 원문 대신 허용된 오류 코드만 공개한다. */
export class ErrorCodeSanitizer {
  code(error: unknown): string {
    if (error instanceof AccountFlowFailure) return this.code(error.cause);
    if (
      error instanceof BoundaryError ||
      error instanceof JungolError ||
      error instanceof PersistenceError ||
      error instanceof LeaseError ||
      error instanceof WorkerPoolError
    )
      return error.code;
    return error instanceof Error && error.name === "AbortError"
      ? "aborted"
      : "internal_error";
  }
}

/** credential과 cookie 필드를 항상 가리는 collector logger를 생성한다. */
export class CollectorLoggerFactory {
  create() {
    return pino({
      level: "info",
      base: { service: "jungol-collector" },
      redact: {
        paths: [
          "password",
          "username",
          "credentials",
          "cookie",
          "authorization",
          "databasePassword",
          "emergencyWebhookUrl",
          "WEBHOOK_URL",
        ],
        censor: "[REDACTED]",
      },
      serializers: {
        err: (error: unknown) => ({
          type: error instanceof Error ? error.name : "UnknownError",
        }),
      },
    });
  }
}
