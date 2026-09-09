import type { SafeJungolDiagnostics } from "../jungol/errors.js";
import { JungolError } from "../jungol/errors.js";
import { ErrorCodeSanitizer } from "../logger.js";
import type {
  AccountFailure,
  CommonFailure,
  CycleReport,
  CycleStatus,
} from "./cycle-types.js";
import { AccountFlowFailure, type CycleFlowLog } from "./flow-log.js";

/** cycle 실행 결과의 안전한 집계와 실패 우선순위를 보존한다. */
export class CycleReportAssembler {
  private readonly errors = new ErrorCodeSanitizer();

  empty(status: CycleStatus): CycleReport {
    return {
      status,
      rankCount: 0,
      syncUserCount: 0,
      metadataUserCount: 0,
      successUserCount: 0,
      failedUserCount: 0,
      scannedAttemptCount: 0,
      acceptedAttemptCount: 0,
      insertedAttemptCount: 0,
      duplicateAttemptCount: 0,
      errorCode: null,
      accountFailureCount: 0,
      accountFailures: [],
      commonFailures: [],
    };
  }

  code(error: unknown): string {
    return this.errors.code(error);
  }

  diagnostics(error: unknown): SafeJungolDiagnostics | undefined {
    if (error instanceof AccountFlowFailure)
      return this.diagnostics(error.cause);
    return error instanceof JungolError ? error.diagnostics : undefined;
  }

  accountTrace(error: unknown) {
    return error instanceof AccountFlowFailure ? error.trace : undefined;
  }

  commonFailure(
    report: CycleReport,
    stage: CommonFailure["stage"],
    error: unknown,
    trace: CycleFlowLog,
  ): CycleReport {
    const code = this.code(error);
    return {
      ...report,
      status:
        report.errorCode === null || report.status === "success"
          ? this.failureStatus(
              code,
              report.successUserCount > 0 ? "partial" : "failed",
            )
          : report.status,
      errorCode: report.errorCode ?? code,
      commonFailures: [
        ...report.commonFailures,
        {
          stage,
          code,
          diagnostics: this.diagnostics(error),
          trace: trace.failureSnapshot(),
        },
      ].slice(0, 5),
    };
  }

  accountFailure(report: CycleReport, failure: AccountFailure): CycleReport {
    return {
      ...report,
      accountFailureCount: report.accountFailureCount + 1,
      accountFailures:
        report.accountFailures.length < 5
          ? [...report.accountFailures, failure]
          : report.accountFailures,
    };
  }

  private failureStatus(code: string, fallback: CycleStatus): CycleStatus {
    if (code === "login_failed" || code === "auth_required")
      return "auth_required";
    if (code === "manual_recovery_required") return "manual_recovery_required";
    return fallback;
  }
}
