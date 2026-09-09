import type { Logger } from "pino";
import type { RankMember } from "../domain/sync.js";
import { SyncPlanner } from "../sync-plan.js";
import { AccountWorkerPool } from "../worker-pool.js";
import { CycleReportAssembler } from "./cycle-report-assembler.js";
import type { CycleAdapters, CycleReport } from "./cycle-types.js";
import {
  AccountFlowFailure,
  AccountFlowLog,
  CycleFlowLog,
} from "./flow-log.js";
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
  private readonly reports = new CycleReportAssembler();

  constructor(
    private readonly adapters: CycleAdapters,
    private readonly options: CycleOptions,
  ) {
    this.planner = new SyncPlanner(options);
    this.workers = new AccountWorkerPool(options.concurrency);
  }

  async run(signal: AbortSignal): Promise<CycleReport> {
    signal.throwIfAborted();
    const trace = new CycleFlowLog();
    let report = this.reports.empty("failed");
    let lease: { release(): Promise<void> } | null = null;
    try {
      lease = await trace.runStep("lease", () => this.adapters.lease());
      if (!lease) {
        trace.dispose();
        return this.reports.empty("skipped_overlap");
      }
      report = await this.runWithLease(signal, trace);
    } catch (error) {
      report = this.reports.commonFailure(report, "cycle", error, trace);
    }
    if (lease) {
      try {
        await trace.runStep("release", () => lease.release());
      } catch (error) {
        report = this.reports.commonFailure(report, "cycle", error, trace);
      }
    }
    const [common] = report.commonFailures.slice(-1);
    if (common)
      this.options.logger?.error(
        {
          code: common.code,
          diagnostics: common.diagnostics,
          trace: common.trace,
        },
        "cycle failed",
      );
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
    trace.dispose();
    return report;
  }

  private async runWithLease(
    signal: AbortSignal,
    trace: CycleFlowLog,
  ): Promise<CycleReport> {
    let report = this.reports.empty("success");
    let commonStage: "cycle" | "projection" = "cycle";
    try {
      await trace.runStep("login", () => this.adapters.login(signal));
      const ranks = await trace.runStep("rank", () =>
        this.adapters.rank(signal),
      );
      const stored = await trace.runStep("stored", () =>
        this.adapters.stored(),
      );
      const jobs: AccountJob[] = [];
      const metadata: RankMember[] = [];
      let regressions = 0;
      await trace.runStep("planner", async () => {
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
      });
      report = {
        ...report,
        rankCount: ranks.length,
        syncUserCount: jobs.length,
        metadataUserCount: metadata.length,
        failedUserCount: regressions,
      };
      const metadataResults = await trace.runStep("worker_completion", () =>
        this.workers.run(metadata, signal, (member) =>
          this.refreshMetadata(member),
        ),
      );
      let refreshed: Promise<readonly RankMember[]> | undefined;
      const refresh = (refreshSignal: AbortSignal) => {
        refreshed ??= this.adapters.rank(refreshSignal);
        return refreshed;
      };
      const syncResults = await trace.runStep("worker_completion", () =>
        this.workers.run(jobs, signal, async (job, _index, workerSignal) =>
          new AccountSyncWorker(job, {
            adapters: this.adapters,
            signal: workerSignal,
            refresh,
          }).run(),
        ),
      );
      for (const [index, result] of metadataResults.entries()) {
        if (result.kind === "failure") {
          const member = metadata[index];
          report = this.reports.accountFailure(
            {
              ...report,
              failedUserCount: report.failedUserCount + 1,
              errorCode: this.reports.code(result.error),
            },
            {
              accountId: member?.accountId ?? "unknown",
              mode: "metadata_refresh",
              code: this.reports.code(result.error),
              diagnostics: this.reports.diagnostics(result.error),
              trace: this.reports.accountTrace(result.error),
            },
          );
        } else {
          report = { ...report, successUserCount: report.successUserCount + 1 };
        }
      }
      for (const [index, result] of syncResults.entries()) {
        if (result.kind === "failure") {
          const job = jobs[index];
          report = this.reports.accountFailure(
            {
              ...report,
              failedUserCount: report.failedUserCount + 1,
              errorCode: this.reports.code(result.error),
            },
            {
              accountId: job?.plan.member.accountId ?? "unknown",
              mode: job?.plan.mode ?? "incremental",
              code: this.reports.code(result.error),
              diagnostics: this.reports.diagnostics(result.error),
              trace: this.reports.accountTrace(result.error),
            },
          );
          if (job)
            this.options.logger?.warn(
              {
                accountId: job.plan.member.accountId,
                rankSolvedCount: job.plan.member.solvedCount,
                phase: job.plan.mode,
                code: this.reports.code(result.error),
                diagnostics: this.reports.diagnostics(result.error),
                trace: this.reports.accountTrace(result.error),
              },
              "account sync failed",
            );
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
      commonStage = "projection";
      await trace.runStep("projection", () => this.adapters.project(signal));
      report = {
        ...report,
        status: report.failedUserCount > 0 ? "partial" : "success",
        errorCode:
          report.errorCode ?? (regressions > 0 ? "rank_regression" : null),
      };
    } catch (error) {
      report = this.reports.commonFailure(report, commonStage, error, trace);
    }
    return report;
  }

  private async refreshMetadata(member: RankMember): Promise<void> {
    const trace = new AccountFlowLog();
    try {
      await trace.runStep("metadata_refresh", () =>
        this.adapters.refreshMetadata(member),
      );
      trace.dispose();
    } catch (error) {
      const snapshot = trace.failureSnapshot();
      if (!snapshot) throw error;
      trace.dispose();
      throw new AccountFlowFailure(error, snapshot);
    }
  }
}
