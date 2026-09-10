import { JungolError } from "../jungol/errors.js";
import { ErrorCodeSanitizer } from "../logger.js";
import type { CycleReport, CycleStatus } from "./cycle-types.js";
import type { CycleFlowStep, FlowTrace } from "./flow-log.js";
import { GroupCycleFailure, type GroupCycleResult } from "./group-cycle.js";

/** pending 수집은 정상 상태로 유지하고 GroupCycle의 부분 실패를 기존 CycleReport로 변환한다. */
export class GroupCycleReportMapper {
  private readonly errors = new ErrorCodeSanitizer();

  overlap(): CycleReport {
    return this.empty("skipped_overlap");
  }

  result(result: GroupCycleResult): CycleReport {
    const failures = [
      ...result.initializationFailures.map((failure) => ({
        ...failure,
        mode: "initial_summary" as const,
      })),
      ...result.settlement.failures.map((failure) => ({
        ...failure,
        mode: "incremental" as const,
      })),
    ];
    return {
      status: result.status === "partial" ? "partial" : "success",
      rankCount: result.memberCount,
      syncUserCount:
        result.settlement.settledUserCount + result.settlement.failedUserCount,
      metadataUserCount: 0,
      successUserCount: result.settlement.settledUserCount,
      failedUserCount: failures.length,
      scannedAttemptCount: result.scan.acceptedCount,
      acceptedAttemptCount: result.scan.acceptedCount,
      insertedAttemptCount: result.settlement.insertedAttemptCount,
      duplicateAttemptCount: result.settlement.duplicateAttemptCount,
      errorCode: failures[0]?.code ?? null,
      accountFailureCount: failures.length,
      accountFailures: failures.slice(0, 5),
      commonFailures: [],
    };
  }

  failure(error: unknown, outerTrace?: FlowTrace<CycleFlowStep>): CycleReport {
    const cause = error instanceof GroupCycleFailure ? error.cause : error;
    const code = this.errors.code(cause);
    return {
      ...this.empty(this.failureStatus(code, "failed")),
      errorCode: code,
      commonFailures: [
        {
          stage: "cycle",
          code,
          diagnostics:
            cause instanceof JungolError ? cause.diagnostics : undefined,
          trace: error instanceof GroupCycleFailure ? error.trace : outerTrace,
        },
      ],
    };
  }

  private empty(status: CycleStatus): CycleReport {
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

  private failureStatus(code: string, fallback: CycleStatus): CycleStatus {
    if (code === "login_failed" || code === "auth_required")
      return "auth_required";
    if (code === "manual_recovery_required") return "manual_recovery_required";
    return fallback;
  }
}
