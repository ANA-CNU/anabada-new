import type { Logger } from "pino";
import type { RankMember } from "../domain/sync.js";
import { ErrorCodeSanitizer } from "../logger.js";
import { SyncPlanner } from "../sync-plan.js";
import { AccountWorkerPool } from "../worker-pool.js";
import type { CycleAdapters, CycleReport, CycleStatus } from "./cycle-types.js";
import { type AccountJob, AccountSyncWorker } from "./sync-account.js";

export type CycleOptions = {
  readonly concurrency: number;
  readonly maxPages: number;
  readonly targetAccountId?: string | undefined;
  readonly logger?: Logger;
};
/** 한 cycle의 순서를 조정하고 결과는 로그·health용 메모리 객체로만 반환한다. */
export class SyncCycleExecutor {
  private readonly planner: SyncPlanner;
  private readonly workers: AccountWorkerPool;
  private readonly errors = new ErrorCodeSanitizer();

  constructor(
    private readonly adapters: CycleAdapters,
    private readonly options: CycleOptions,
  ) {
    this.planner = new SyncPlanner(options);
    this.workers = new AccountWorkerPool(options.concurrency);
  }

  async run(signal: AbortSignal): Promise<CycleReport> {
    signal.throwIfAborted();
    const lease = await this.adapters.lease();
    if (!lease) return this.empty("skipped_overlap");
    try {
      return await this.runWithLease(signal);
    } finally {
      await lease.release();
    }
  }

  private async runWithLease(signal: AbortSignal): Promise<CycleReport> {
    let report = this.empty("success");
    try {
      await this.adapters.login(signal);
      const ranks = await this.adapters.rank(signal);
      const stored = await this.adapters.stored();
      const jobs: AccountJob[] = [];
      const metadata: RankMember[] = [];
      let regressions = 0;
      for (const member of ranks) {
        if (
          this.options.targetAccountId &&
          member.accountId !== this.options.targetAccountId
        )
          continue;
        const previous = stored.get(member.accountId) ?? null;
        const selection = this.planner.plan(member, previous);
        if (
          selection.kind === "initial_summary" ||
          selection.kind === "incremental"
        )
          jobs.push({ plan: selection.plan, previous });
        else if (selection.kind === "metadata_refresh")
          metadata.push(selection.member);
        else {
          regressions += 1;
          this.options.logger?.warn(
            { accountId: member.accountId, code: "rank_regression" },
            "account skipped",
          );
        }
      }
      report = {
        ...report,
        rankCount: ranks.length,
        syncUserCount: jobs.length,
        metadataUserCount: metadata.length,
        failedUserCount: regressions,
      };
      const metadataResults = await this.workers.run(
        metadata,
        signal,
        (member) => this.adapters.refreshMetadata(member),
      );
      let refreshed: Promise<readonly RankMember[]> | undefined;
      const refresh = (refreshSignal: AbortSignal) => {
        refreshed ??= this.adapters.rank(refreshSignal);
        return refreshed;
      };
      const syncResults = await this.workers.run(
        jobs,
        signal,
        async (job, _index, workerSignal) =>
          new AccountSyncWorker(job, {
            adapters: this.adapters,
            signal: workerSignal,
            refresh,
          }).run(),
      );
      for (const result of metadataResults) {
        if (result.kind === "failure") {
          report = {
            ...report,
            failedUserCount: report.failedUserCount + 1,
            errorCode: this.errors.code(result.error),
          };
        } else {
          report = { ...report, successUserCount: report.successUserCount + 1 };
        }
      }
      for (const result of syncResults) {
        if (result.kind === "failure") {
          report = {
            ...report,
            failedUserCount: report.failedUserCount + 1,
            errorCode: this.errors.code(result.error),
          };
        } else
          report = {
            ...report,
            successUserCount: report.successUserCount + 1,
            scannedAttemptCount:
              report.scannedAttemptCount + result.value.scannedCount,
            acceptedAttemptCount:
              report.acceptedAttemptCount + result.value.acceptedCount,
            insertedAttemptCount:
              report.insertedAttemptCount + result.value.insertedAttemptCount,
            duplicateAttemptCount:
              report.duplicateAttemptCount + result.value.duplicateAttemptCount,
          };
      }
      signal.throwIfAborted();
      await this.adapters.project(signal);
      report = {
        ...report,
        status: report.failedUserCount > 0 ? "partial" : "success",
        errorCode:
          report.errorCode ?? (regressions > 0 ? "rank_regression" : null),
      };
    } catch (error) {
      const code = this.errors.code(error);
      report = {
        ...report,
        status: this.failureStatus(
          code,
          report.successUserCount > 0 ? "partial" : "failed",
        ),
        errorCode: code,
      };
      this.options.logger?.error({ code }, "cycle failed");
    }
    this.options.logger?.info(
      {
        status: report.status,
        rankCount: report.rankCount,
        successUserCount: report.successUserCount,
        failedUserCount: report.failedUserCount,
        insertedAttemptCount: report.insertedAttemptCount,
        code: report.errorCode,
      },
      "cycle completed",
    );
    return report;
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
    };
  }

  private failureStatus(code: string, fallback: CycleStatus): CycleStatus {
    if (code === "login_failed" || code === "auth_required")
      return "auth_required";
    if (code === "manual_recovery_required") return "manual_recovery_required";
    return fallback;
  }
}
