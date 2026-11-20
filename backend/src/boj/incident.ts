import type { InternalIncidentReporter } from "../emergency-webhook.js";
import { BackendInfrastructureError } from "../infrastructure/errors.js";
import { logger } from "../logger.js";
import { BojHtmlError } from "./html-source.js";
import { BojSubmissionPageError } from "./member-sync.js";
import { BojReadError } from "./page-reader.js";
import { BojSettlementConflict } from "./settlement-repository.js";
import { SolvedAcSettlementError } from "./solved-ac-collector.js";

type Operation =
  | "boj.cycle_failed"
  | "boj.member_failed"
  | "boj.solved_ac_refresh_failed";

function classify(error: unknown): { code: string; alert: boolean } {
  if (error instanceof BackendInfrastructureError)
    return { code: error.code, alert: true };
  if (error instanceof BojReadError) {
    if (error.status === 429) return { code: "boj_rate_limited", alert: false };
    if (error.status === 403)
      return { code: "boj_access_blocked", alert: true };
    return { code: `boj_${error.reason}`, alert: true };
  }
  if (error instanceof BojHtmlError || error instanceof BojSubmissionPageError)
    return { code: `boj_${error.reason}`, alert: true };
  if (error instanceof BojSettlementConflict)
    return {
      code: `boj_${error.reason}`,
      alert: error.reason !== "cursor_changed",
    };
  if (error instanceof SolvedAcSettlementError)
    return error.reason === "blocked"
      ? { code: "solved_ac_access_blocked", alert: true }
      : { code: `solved_ac_${error.reason}`, alert: false };
  return { code: "boj_unexpected_failure", alert: true };
}

export class BojIncidents {
  constructor(private readonly reporter?: InternalIncidentReporter) {}

  async failure(operationId: Operation, error: unknown): Promise<void> {
    const { code, alert } = classify(error);
    if (!alert) {
      logger.warn({ code }, operationId);
      return;
    }
    await this.report(operationId, code);
  }

  accessBlocked(): Promise<void> {
    return this.report(
      "boj.solved_ac_refresh_failed",
      "solved_ac_access_blocked",
    );
  }

  private async report(operationId: Operation, code: string): Promise<void> {
    logger.error({ code }, operationId);
    try {
      const result = await this.reporter?.report({
        code,
        operationId,
        occurredAt: new Date(),
      });
      if (result === "failed")
        logger.warn({ operationId }, "backend.incident_report_failed");
    } catch {
      logger.warn({ operationId }, "backend.incident_report_failed");
    }
  }
}
