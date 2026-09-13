import type { Pool } from "mysql2/promise";
import type { Logger } from "pino";
import { AccountInitializationService } from "../account-initialization.js";
import { AccountSettlementService } from "../account-settlement.js";
import type { CollectorConfig, Credentials } from "../config.js";
import { GroupFeedCollector } from "../jungol/group-feed.js";
import { ProblemMetadataResolver } from "../jungol/metadata.js";
import { AccountProfileCollector } from "../jungol/profile.js";
import { RankCollector } from "../jungol/rank.js";
import { JungolRequestCoordinator } from "../jungol/request-coordinator.js";
import { JungolSession } from "../jungol/session.js";
import { HookRepository } from "../mysql/hooks.js";
import { CycleLeaseManager } from "../mysql/lease.js";
import { AccountUnitOfWork } from "../mysql/unit-of-work.js";
import { ProjectionService } from "../projection.js";
import { KstCalendar } from "../scoring/daily.js";
import { WeightedRankingPolicy } from "../scoring/ranking.js";
import { AcRatingTierMapper } from "../scoring/tier.js";
import {
  DiscordWebhookClient,
  ProjectionNotificationService,
  WebhookBroadcaster,
  WebhookMessageFormatter,
} from "../webhook.js";
import { CycleTrace } from "./cycle-diagnostics.js";
import type { CycleReport } from "./cycle-types.js";
import { CycleFlowLog } from "./flow-log.js";
import { GroupCycleExecutor, type GroupCycleResult } from "./group-cycle.js";
import { GroupCycleReportMapper } from "./group-cycle-report.js";
import { GroupRuntime } from "./group-runtime.js";
import {
  GroupFeedPageLease,
  GroupRuntimeBrowser,
} from "./group-runtime-browser.js";

type Runtime = {
  readonly config: CollectorConfig;
  readonly credentials: Credentials;
  readonly pool: Pool;
  readonly logger: Logger;
  readonly randomSeed: string;
};

/** lease를 먼저 확보한 뒤 browser/session을 열어 GroupRuntime 한 cycle을 조립·정리한다. */
export class SyncCycle {
  private session: JungolSession | undefined;
  private readonly requests = new JungolRequestCoordinator();
  private readonly metadata: ProblemMetadataResolver;
  private flow: CycleFlowLog | undefined;
  private groupExecutor: GroupCycleExecutor | undefined;
  private feedPage: GroupFeedPageLease | undefined;

  constructor(private readonly runtime: Runtime) {
    this.metadata = new ProblemMetadataResolver(runtime.config, this.requests);
  }

  async close(): Promise<void> {
    this.requests.close();
    try {
      await this.feedPage?.invalidate();
    } finally {
      this.feedPage = undefined;
      await this.session?.close();
      this.session = undefined;
    }
  }

  currentStage(): string | undefined {
    return this.groupExecutor?.currentStage() ?? this.flow?.currentStep();
  }

  async run(signal: AbortSignal, suppliedTrace?: CycleTrace) {
    const { config, credentials, pool, logger, randomSeed } = this.runtime;
    const reports = new GroupCycleReportMapper();
    const leases = new CycleLeaseManager(pool);
    const trace = new CycleFlowLog();
    this.flow = trace;
    let lease: Awaited<ReturnType<CycleLeaseManager["acquire"]>> | null = null;
    let browser: GroupRuntimeBrowser | undefined;
    let groupResult: GroupCycleResult | undefined;
    let retainFeedPage = false;
    let report: CycleReport = reports.overlap();
    this.metadata.clearCycle();
    try {
      lease = await trace.runStep("lease", () => leases.acquire());
      if (!lease) report = reports.overlap();
      else {
        const session = async () => {
          this.session ??= await JungolSession.launch(config, this.requests);
          return this.session;
        };
        const calendar = new KstCalendar();
        const cycleTrace = suppliedTrace ?? new CycleTrace(crypto.randomUUID());
        const unitOfWork = new AccountUnitOfWork(pool, calendar);
        const tiers = new AcRatingTierMapper();
        const projectionService = new ProjectionService(
          pool,
          calendar,
          new WeightedRankingPolicy(),
          randomSeed,
        );
        const projection = new ProjectionNotificationService(
          projectionService,
          new WebhookBroadcaster(
            new HookRepository(pool),
            new DiscordWebhookClient(),
            new WebhookMessageFormatter(),
            logger,
          ),
        );
        this.feedPage ??= new GroupFeedPageLease(async () =>
          (await session()).newPage(),
        );
        const cycleBrowser = new GroupRuntimeBrowser({
          newPage: async () => (await session()).newPage(),
          groupId: config.groupId,
          baseUrl: config.baseUrl,
          pageTimeoutMs: config.pageTimeoutMs,
          requests: this.requests,
          rank: new RankCollector(config, this.requests, tiers),
          feed: new GroupFeedCollector(config, this.requests, cycleTrace),
          profile: new AccountProfileCollector(config, this.requests),
          metadata: this.metadata,
          feedPage: this.feedPage,
        });
        browser = cycleBrowser;
        const groupId = String(config.groupId);
        const group = new GroupRuntime({
          groupId,
          accountUnitOfWork: unitOfWork,
          initialization: new AccountInitializationService(unitOfWork, tiers),
          settlement: new AccountSettlementService(
            unitOfWork,
            groupId,
            calendar,
            tiers,
          ),
          calendar,
          members: (memberSignal) => cycleBrowser.members(memberSignal),
          feed: cycleBrowser,
          profiles: cycleBrowser,
          metadata: {
            read: (problemId, metadataSignal) =>
              cycleBrowser.readMetadata(problemId, metadataSignal),
          },
          project: async (projectSignal) => {
            await projection.run(projectSignal);
          },
          projectOnConnection: (connection, now) =>
            projectionService.rebuildOnConnection(connection, now),
          notifyProjection: (result, projectSignal) =>
            projection.notify(result, projectSignal),
          warn: (code) => logger.warn({ code }, "collector.post_commit_failed"),
          cycleTrace,
        });
        await trace.runStep("login", async () =>
          (await session()).ensureLogin(credentials, signal),
        );
        const executor = new GroupCycleExecutor(group);
        this.groupExecutor = executor;
        groupResult = await trace.runStep("worker_completion", () =>
          executor.run(signal),
        );
        retainFeedPage =
          groupResult.status === "success_pending" &&
          groupResult.scan.phase === "collecting";
        report = reports.result(groupResult);
      }
    } catch (error) {
      report = reports.failure(error, trace.failureSnapshot());
    } finally {
      try {
        await browser?.close();
      } catch (_error) {
        if (report.status === "success" || report.status === "skipped_overlap")
          logger.warn(
            { code: "browser_close_failed", cycleTrace: report.cycleTrace },
            "collector.post_commit_failed",
          );
      } finally {
        try {
          if (!retainFeedPage) await this.feedPage?.invalidate();
        } catch (_error) {
          logger.warn(
            { code: "feed_page_close_failed", cycleTrace: report.cycleTrace },
            "collector.post_commit_failed",
          );
        } finally {
          try {
            const acquiredLease = lease;
            if (acquiredLease)
              await trace.runStep("release", () => acquiredLease.release());
          } catch (_error) {
            if (
              report.status === "success" ||
              report.status === "skipped_overlap"
            )
              logger.warn(
                { code: "lease_release_failed", cycleTrace: report.cycleTrace },
                "collector.post_commit_failed",
              );
          }
        }
        this.metadata.clearCycle();
        trace.dispose();
        this.flow = undefined;
        this.groupExecutor = undefined;
      }
    }
    const [failure] = report.commonFailures;
    if (failure)
      logger.error(
        {
          code: failure.code,
          diagnostics: failure.diagnostics,
          trace: failure.trace,
          cycleTrace: report.cycleTrace,
        },
        "cycle failed",
      );
    logger.info(
      {
        status: report.status,
        rankCount: report.rankCount,
        successUserCount: report.successUserCount,
        failedUserCount: report.failedUserCount,
        insertedAttemptCount: report.insertedAttemptCount,
        code: report.errorCode,
        pending: groupResult?.status === "success_pending",
        phase: groupResult?.scan.phase,
        scannedPageCount: groupResult?.scan.scannedPageCount,
      },
      "cycle completed",
    );
    return report;
  }
}
