import type { PersistAccountInput, PersistResult } from "../account-sync.js";
import type {
  AccountInitialSnapshot,
  AccountSyncPlan,
  AccountSyncState,
  InitialSolvedProblem,
  InitialSubmissionCursor,
  RankMember,
} from "../domain/sync.js";
import type { ProblemId } from "../domain.js";
import type { SafeJungolDiagnostics } from "../jungol/errors.js";
import type { ProblemMetadata } from "../jungol/metadata.js";
import type { CollectedSubmissions } from "../jungol/submission.js";
import type {
  AccountFlowStep,
  CycleFlowStep,
  FlowTrace,
  GroupCycleFlowStep,
} from "./flow-log.js";

export interface AccountBrowser {
  /**
   * 신규 계정의 해결 목록만 읽는다. 과거 제출 이력을 모두 재생하지 않아
   * Jungol 요청량과 초기 적재 시간을 제한하는 전용 경로다.
   */
  summary(
    plan: AccountSyncPlan,
    signal: AbortSignal,
  ): Promise<readonly InitialSolvedProblem[]>;
  /** 초기 기준선의 증분 시작점으로 첫 제출 API 페이지의 최신 번호만 읽는다. */
  cursor(
    plan: AccountSyncPlan,
    signal: AbortSignal,
  ): Promise<InitialSubmissionCursor>;
  /** 이미 기준선이 있는 계정의 cursor 기반 제출 이력 수집 경로다. */
  collect(
    plan: AccountSyncPlan,
    signal: AbortSignal,
  ): Promise<CollectedSubmissions>;
  metadata(id: ProblemId, signal: AbortSignal): Promise<ProblemMetadata>;
  close(): Promise<void>;
}
export interface CycleAdapters {
  lease(): Promise<{ release(): Promise<void> } | null>;
  login(signal: AbortSignal): Promise<void>;
  rank(signal: AbortSignal): Promise<readonly RankMember[]>;
  stored(): Promise<ReadonlyMap<string, AccountSyncState>>;
  browser(): Promise<AccountBrowser>;
  persist(input: PersistAccountInput): Promise<PersistResult>;
  /** 초기 해결 목록을 synthetic baseline으로 원자적으로 저장한다. */
  initialize(snapshot: AccountInitialSnapshot): Promise<void>;
  refreshMetadata(member: RankMember): Promise<void>;
  project(signal: AbortSignal): Promise<void>;
}

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
  readonly errorCode: string | null;
  readonly accountFailureCount: number;
  readonly accountFailures: readonly AccountFailure[];
  readonly commonFailures: readonly CommonFailure[];
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
