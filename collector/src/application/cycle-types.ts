import type { SafeJungolDiagnostics } from "../jungol/errors.js";
import type { SettlementAttemptOutcome } from "../settlement-outcome.js";
import type { CycleTraceSnapshot } from "./cycle-diagnostics.js";
import type {
  AccountFlowStep,
  CycleFlowStep,
  FlowTrace,
  GroupCycleFlowStep,
} from "./flow-log.js";

export type CycleStatus =
  | "success"
  | "partial"
  | "failed"
  | "skipped_overlap"
  | "auth_required"
  | "manual_recovery_required";

export type CycleReport = {
  readonly status: CycleStatus;
  readonly rankCount: number;
  readonly syncUserCount: number;
  readonly metadataUserCount: number;
  readonly successUserCount: number;
  readonly failedUserCount: number;
  readonly scannedAttemptCount: number;
  readonly acceptedAttemptCount: number;
  readonly insertedAttemptCount: number;
  readonly duplicateAttemptCount: number;
  readonly settlementOutcomes?: readonly SettlementAttemptOutcome[];
  readonly initializedAccountCount?: number;
  readonly initializedSolvedCount?: number;
  readonly errorCode: string | null;
  readonly accountFailureCount: number;
  readonly accountFailures: readonly AccountFailure[];
  readonly commonFailures: readonly CommonFailure[];
  readonly pending?: boolean;
  readonly cycleTrace?: CycleTraceSnapshot | undefined;
};

/** Discord 알림에 허용되는 계정별 collector 실패 정보만 보관한다. */
export type AccountFailure = {
  readonly accountId: string;
  readonly mode: "initial_summary" | "incremental" | "metadata_refresh";
  readonly code: string;
  readonly diagnostics?: SafeJungolDiagnostics | undefined;
  readonly trace?: FlowTrace<AccountFlowStep> | undefined;
};
export type CommonFailure = {
  readonly stage: "projection" | "cycle";
  readonly code: string;
  readonly diagnostics?: SafeJungolDiagnostics | undefined;
  readonly trace?: FlowTrace<CycleFlowStep | GroupCycleFlowStep> | undefined;
};
