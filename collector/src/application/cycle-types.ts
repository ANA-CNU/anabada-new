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
import type { ProblemMetadata } from "../jungol/metadata.js";
import type { CollectedSubmissions } from "../jungol/submission.js";

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
};
