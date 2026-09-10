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
import type { CycleReport } from "./cycle-types.js";
import { CycleFlowLog } from "./flow-log.js";
import { GroupCycleExecutor, type GroupCycleResult } from "./group-cycle.js";
import { GroupCycleReportMapper } from "./group-cycle-report.js";
import { GroupRuntime } from "./group-runtime.js";
import { GroupRuntimeBrowser } from "./group-runtime-browser.js";

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

  constructor(private readonly runtime: Runtime) {
    this.metadata = new ProblemMetadataResolver(runtime.config, this.requests);
  }

  async close(): Promise<void> {
    this.requests.close();
    await this.session?.close();
    this.session = undefined;
  }

  async run(signal: AbortSignal) {
    const { config, credentials, pool, logger, randomSeed } = this.runtime;
    const reports = new GroupCycleReportMapper();
    const leases = new CycleLeaseManager(pool);
    const trace = new CycleFlowLog();
    let lease: Awaited<ReturnType<CycleLeaseManager["acquire"]>> | null = null;
    let browser: GroupRuntimeBrowser | undefined;
    let groupResult: GroupCycleResult | undefined;
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
        const unitOfWork = new AccountUnitOfWork(pool, calendar);
        const tiers = new AcRatingTierMapper();
        const projection = new ProjectionNotificationService(
          new ProjectionService(
            pool,
            calendar,
            new WeightedRankingPolicy(),
            randomSeed,
          ),
          new WebhookBroadcaster(
            new HookRepository(pool),
            new DiscordWebhookClient(),
            new WebhookMessageFormatter(),
            logger,
          ),
        );
        const cycleBrowser = new GroupRuntimeBrowser({
          newPage: async () => (await session()).newPage(),
          groupId: config.groupId,
          baseUrl: config.baseUrl,
          pageTimeoutMs: config.pageTimeoutMs,
          requests: this.requests,
          rank: new RankCollector(config, this.requests, tiers),
          feed: new GroupFeedCollector(config, this.requests),
          profile: new AccountProfileCollector(config, this.requests),
          metadata: this.metadata,
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
        });
        await trace.runStep("login", async () =>
          (await session()).ensureLogin(credentials, signal),
        );
        groupResult = await new GroupCycleExecutor(group).run(signal);
        report = reports.result(groupResult);
      }
    } catch (error) {
      report = reports.failure(error, trace.failureSnapshot());
    } finally {
      try {
        await browser?.close();
      } catch (error) {
        if (report.status === "success" || report.status === "skipped_overlap")
          report = reports.failure(error);
      } finally {
        try {
          const acquiredLease = lease;
          if (acquiredLease)
            await trace.runStep("release", () => acquiredLease.release());
        } catch (error) {
          if (
            report.status === "success" ||
            report.status === "skipped_overlap"
          )
            report = reports.failure(error, trace.failureSnapshot());
        }
        this.metadata.clearCycle();
        trace.dispose();
      }
    }
    const [failure] = report.commonFailures;
    if (failure)
      logger.error(
        {
          code: failure.code,
          diagnostics: failure.diagnostics,
          trace: failure.trace,
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
