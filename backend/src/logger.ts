import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/** logger는 기록만 담당한다. 장애 외부 전송은 명시적 reporter 경계만 수행한다. */
export const logger = pino({
  level: isProduction ? "info" : "debug",
  transport: { target: "pino-pretty", options: { colorize: true } },
  redact: {
    paths: ["WEBHOOK_URL", "webhookUrl", "emergencyWebhookUrl"],
    censor: "[REDACTED]",
  },
});
