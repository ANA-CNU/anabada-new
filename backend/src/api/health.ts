import { Elysia } from "elysia";
import type { InternalIncidentReporter } from "../emergency-webhook.js";
import {
  DatabaseContractError,
  DatabaseQueryError,
} from "../infrastructure/errors.js";
import type { Clock } from "../infrastructure/time.js";

export interface HealthProbe {
  check(): Promise<boolean>;
}
export interface HealthTimeoutExecutor {
  run<T>(operation: () => Promise<T>): Promise<T>;
}
export interface HealthTimer {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}
export class HealthTimeoutError extends Error {
  readonly name = "HealthTimeoutError";
}
export class BoundedHealthTimeout implements HealthTimeoutExecutor {
  constructor(
    private readonly timer: HealthTimer = {
      setTimeout: (callback, delayMs) =>
        Number(globalThis.setTimeout(callback, delayMs)),
      clearTimeout: (handle) => globalThis.clearTimeout(handle),
    },
    private readonly timeoutMs = 1_500,
  ) {}
  async run<T>(operation: () => Promise<T>): Promise<T> {
    let handle: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      handle = this.timer.setTimeout(
        () => reject(new HealthTimeoutError()),
        this.timeoutMs,
      );
    });
    try {
      return await Promise.race([operation(), timeout]);
    } finally {
      if (handle !== undefined) this.timer.clearTimeout(handle);
    }
  }
}

export function createHealthRoute(
  probe: HealthProbe,
  clock: Clock,
  reporter: InternalIncidentReporter,
  timeout: HealthTimeoutExecutor,
) {
  return new Elysia().get("/health", async ({ set }) => {
    try {
      if (!(await timeout.run(() => probe.check()))) {
        set.status = 503;
        await reporter.report({
          code: "database_schema_not_ready",
          occurredAt: clock.now(),
          operationId: "health.ready",
        });
        return { status: "unhealthy" };
      }
      return { status: "healthy", timestamp: clock.now().toISOString() };
    } catch (error) {
      if (error instanceof HealthTimeoutError) {
        set.status = 503;
        await reporter.report({
          code: "database_unavailable",
          occurredAt: clock.now(),
          operationId: "health.ready",
        });
        return { status: "unhealthy" };
      }
      if (
        error instanceof DatabaseQueryError ||
        error instanceof DatabaseContractError
      ) {
        set.status = 503;
        await reporter.report({
          code: error.code,
          occurredAt: clock.now(),
          operationId: error.operationId,
        });
        return { status: "unhealthy" };
      }
      throw error;
    }
  });
}
