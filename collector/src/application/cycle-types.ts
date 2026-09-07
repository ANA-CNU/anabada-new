import type { PersistAccountInput, PersistResult } from "../account-sync.js";
import type {
  AccountSyncPlan,
  AccountSyncState,
  RankMember,
} from "../domain/sync.js";
import type { ProblemId } from "../domain.js";
import type { ProblemMetadata } from "../jungol/metadata.js";
import type { CollectedSubmissions } from "../jungol/submission.js";

export interface AccountBrowser {
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
