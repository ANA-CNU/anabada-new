import type { PoolConnection } from "mysql2/promise";
import type { AccountSettlementService } from "../account-settlement.js";
import { AcceptedAttempt, isKnownProblemTier } from "../domain/sync.js";
import type { ProblemId } from "../domain.js";
import { ProblemTierEstimator } from "../group-domain.js";
import type { ProblemMetadata } from "../jungol/metadata.js";
import {
  GroupFeedRepository,
  type SettlementInboxRow,
} from "../mysql/group-feed.js";
import { AccountFlowLog } from "./flow-log.js";
import type {
  GroupSettlementFailure,
  GroupSettlementResult,
} from "./group-cycle.js";
import type { GroupRuntimeProfilePort } from "./group-runtime.js";
import { GroupRuntimeErrorPolicy } from "./group-runtime-error.js";

export interface GroupRuntimeMetadataPort {
  read(problemId: ProblemId, signal: AbortSignal): Promise<ProblemMetadata>;
}

type ProblemTierEstimatorPort = Pick<ProblemTierEstimator, "estimate_tier">;

export type GroupSettlementRuntimeDependencies = {
  readonly groupId: string;
  readonly settlement: AccountSettlementService;
  readonly profiles: GroupRuntimeProfilePort;
  readonly metadata: GroupRuntimeMetadataPort;
  readonly now?: () => Date;
  readonly tierEstimator?: ProblemTierEstimatorPort;
};

type Transaction = <T>(
  operation: (connection: PoolConnection) => Promise<T>,
) => Promise<T>;

/** 그룹 rank snapshot과 문제 metadata를 transaction 전에 읽고 200행·10계정 정산 실패를 계정별로 격리한다. */
export class GroupSettlementRuntime {
  private readonly now: () => Date;
  private readonly tierEstimator: ProblemTierEstimatorPort;
  private readonly metadata = new Map<ProblemId, ProblemMetadata>();
  private readonly estimatedTiers = new Map<ProblemId, number>();
  private readonly errors = new GroupRuntimeErrorPolicy();

  constructor(
    private readonly dependencies: GroupSettlementRuntimeDependencies,
    private readonly transaction: Transaction,
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.tierEstimator =
      dependencies.tierEstimator ?? new ProblemTierEstimator();
  }

  async settle(signal: AbortSignal): Promise<GroupSettlementResult> {
    this.metadata.clear();
    this.estimatedTiers.clear();
    try {
      const rows = await this.transaction((connection) =>
        new GroupFeedRepository(connection).readSettlementBatch(
          this.dependencies.groupId,
        ),
      );
      const groups = new Map<
        SettlementInboxRow["accountId"],
        readonly SettlementInboxRow[]
      >();
      for (const row of rows)
        groups.set(row.accountId, [...(groups.get(row.accountId) ?? []), row]);
      let insertedAttemptCount = 0;
      let duplicateAttemptCount = 0;
      const failures: GroupSettlementFailure[] = [];
      for (const [accountId, rowsForAccount] of groups) {
        const trace = new AccountFlowLog();
        try {
          const member = await trace.runStep("rank_refresh", () =>
            this.dependencies.profiles.currentMember(accountId, signal),
          );
          await trace.runStep("prepare_snapshot", async () => {
            if (member.accountId !== accountId)
              throw new RangeError("group_profile_account_mismatch");
          });
          const attempts = await trace.runStep("metadata", () =>
            this.prepareAttempts(rowsForAccount, signal),
          );
          const result = await trace.runStep("db_persist", () =>
            this.dependencies.settlement.commit({
              member,
              attempts,
              highestSubmissionId: this.highestSubmissionId(attempts),
              now: this.now(),
              signal,
            }),
          );
          insertedAttemptCount += result.insertedAttemptCount;
          duplicateAttemptCount += result.duplicateAttemptCount;
        } catch (error) {
          if (signal.aborted) throw error;
          if (this.errors.isCircuit(error)) throw error;
          failures.push({
            accountId,
            code: this.errors.code(error),
            trace: trace.failureSnapshot(),
          });
        } finally {
          trace.dispose();
        }
      }
      const inboxEmpty = await this.transaction(
        async (connection) =>
          (
            await new GroupFeedRepository(connection).readSettlementBatch(
              this.dependencies.groupId,
              1,
              1,
            )
          ).length === 0,
      );
      const result = {
        settledUserCount: groups.size - failures.length,
        failedUserCount: failures.length,
        failures,
        insertedAttemptCount,
        duplicateAttemptCount,
        inboxEmpty,
      };
      return result;
    } finally {
      this.metadata.clear();
      this.estimatedTiers.clear();
    }
  }

  private async prepareAttempts(
    rows: readonly SettlementInboxRow[],
    signal: AbortSignal,
  ): Promise<readonly AcceptedAttempt[]> {
    const attempts: AcceptedAttempt[] = [];
    for (const row of rows) {
      signal.throwIfAborted();
      const metadata = await this.metadataFor(row.problemId, signal);
      const problemTier = isKnownProblemTier(metadata.tier) ? metadata.tier : 0;
      const estimatedTier =
        problemTier === 0 ? await this.estimatedTierFor(row.problemId) : 0;
      attempts.push(
        new AcceptedAttempt(
          row.externalSubmissionId,
          row.problemId,
          metadata.title,
          problemTier,
          row.submittedAt,
          row.score,
          estimatedTier,
        ),
      );
    }
    return attempts;
  }

  private async metadataFor(
    problemId: ProblemId,
    signal: AbortSignal,
  ): Promise<ProblemMetadata> {
    const cached = this.metadata.get(problemId);
    if (cached) return cached;
    const metadata = await this.dependencies.metadata.read(problemId, signal);
    this.metadata.set(problemId, metadata);
    return metadata;
  }

  private async estimatedTierFor(problemId: ProblemId): Promise<number> {
    const cached = this.estimatedTiers.get(problemId);
    if (cached !== undefined) return cached;
    const tier = await this.tierEstimator.estimate_tier(problemId);
    this.estimatedTiers.set(problemId, tier);
    return tier;
  }

  private highestSubmissionId(attempts: readonly AcceptedAttempt[]): bigint {
    return attempts.reduce(
      (highest, attempt) =>
        BigInt(attempt.submissionId) > highest
          ? BigInt(attempt.submissionId)
          : highest,
      0n,
    );
  }
}
