import "dotenv/config";
import pino from "pino";
import { BackendEmergencyWebhook } from "./emergency-webhook.js";

const isProduction = process.env.NODE_ENV === "production";

const SAFE_ERROR_CODE = /^[a-zA-Z0-9_-]{1,64}$/;

function emergencyCode(arguments_: readonly unknown[]): string {
  const context = arguments_[0];
  if (typeof context !== "object" || context === null || !("code" in context))
    return "backend_error";

  const code = context.code;
  if (typeof code === "string" && SAFE_ERROR_CODE.test(code))
    return code.toLowerCase();
  if (
    typeof code === "number" &&
    Number.isInteger(code) &&
    code >= 500 &&
    code <= 599
  )
    return `http_${code}`;
  return "backend_error";
}

export const backendEmergencyWebhook = new BackendEmergencyWebhook(
  process.env.WEBHOOK_URL || undefined,
);

export const logger = pino({
  level: isProduction ? "info" : "debug",
  transport: {
    target: "pino-pretty",
    options: { colorize: true },
  },
  redact: {
    paths: ["WEBHOOK_URL", "webhookUrl", "emergencyWebhookUrl"],
    censor: "[REDACTED]",
  },
  hooks: {
    logMethod(arguments_, method, level) {
      if (level >= 50)
        void backendEmergencyWebhook.notify({
          code: emergencyCode(arguments_),
          occurredAt: new Date(),
        });
      return method.apply(this, arguments_);
    },
  },
});
