import type { Pool } from "mysql2/promise";
import type { Logger } from "pino";
import { AccountInitializationService } from "../account-initialization.js";
import { AccountSyncService } from "../account-sync.js";
import type { CollectorConfig, Credentials } from "../config.js";
import type { ProblemId } from "../domain.js";
import { AccountSummaryCollector } from "../jungol/account-summary.js";
import {
  type ProblemMetadata,
  ProblemMetadataResolver,
} from "../jungol/metadata.js";
import { RankCollector } from "../jungol/rank.js";
import { JungolRequestCoordinator } from "../jungol/request-coordinator.js";
import { JungolSession } from "../jungol/session.js";
import { SubmissionCollector } from "../jungol/submission.js";
import { SubmissionCursorCollector } from "../jungol/submission-cursor.js";
import { HookRepository } from "../mysql/hooks.js";
import { CycleLeaseManager } from "../mysql/lease.js";
import { AccountUnitOfWork } from "../mysql/unit-of-work.js";
import { UserRepository } from "../mysql/users.js";
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
import type { CycleAdapters } from "./cycle-types.js";
import { SyncCycleExecutor } from "./execute-cycle.js";
import { MetadataRefreshService } from "./metadata-refresh.js";

type Runtime = {
  readonly config: CollectorConfig;
  readonly credentials: Credentials;
  readonly pool: Pool;
  readonly logger: Logger;
  readonly randomSeed: string;
};
/** 브라우저 세션과 cycle 의존성을 조립하되 사용자 transaction에는 직접 관여하지 않는다. */
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
    this.metadata.clearCycle();
    const { config, credentials, pool, logger, randomSeed } = this.runtime;
    const session = async () => {
      this.session ??= await JungolSession.launch(config, this.requests);
      return this.session;
    };
    const calendar = new KstCalendar();
    const ratingTierMapper = new AcRatingTierMapper();
    const unitOfWork = new AccountUnitOfWork(pool, calendar);
    const persist = new AccountSyncService(
      unitOfWork,
      calendar,
      ratingTierMapper,
    );
    const initialize = new AccountInitializationService(
      unitOfWork,
      ratingTierMapper,
    );
    const metadataRefresh = new MetadataRefreshService(
      unitOfWork,
      ratingTierMapper,
    );
    const lease = new CycleLeaseManager(pool);
    const projection = new ProjectionService(
      pool,
      calendar,
      new WeightedRankingPolicy(),
      randomSeed,
    );
    const projectionNotification = new ProjectionNotificationService(
      projection,
      new WebhookBroadcaster(
        new HookRepository(pool),
        new DiscordWebhookClient(),
        new WebhookMessageFormatter(),
        logger,
      ),
    );
    const rank = new RankCollector(config, this.requests, ratingTierMapper);
    const submissions = new SubmissionCollector(config, this.requests);
    const submissionCursor = new SubmissionCursorCollector(
      config,
      this.requests,
    );
    const summary = new AccountSummaryCollector(config, this.requests);
    const metadata = new Map<ProblemId, Promise<ProblemMetadata>>();
    const adapters: CycleAdapters = {
      lease: () => lease.acquire(),
      stored: async () => {
        const connection = await pool.getConnection();
        try {
          return new Map(
            (await new UserRepository(connection).readAll()).map((user) => [
              user.accountId,
              {
                solvedCount: user.solvedCount,
                lastSubmissionId: BigInt(user.cursor),
              },
            ]),
          );
        } finally {
          connection.release();
        }
      },
      login: async (signal) => {
        await (await session()).ensureLogin(credentials, signal);
      },
      rank: async (signal) => {
        const page = await (await session()).newPage();
        try {
          return await rank.collect(page, config.groupId, signal);
        } finally {
          await page.close();
        }
      },
      browser: async () => {
        const page = await (await session()).newPage();
        return {
          summary: (plan, signal) => summary.collect(page, plan, signal),
          cursor: (plan, signal) =>
            submissionCursor.collect(page, plan, signal),
          collect: (plan, signal) => submissions.collect(page, plan, signal),
          metadata: (id, signal) => {
            const pending = metadata.get(id);
            if (pending) return pending;
            const resolved = this.metadata.resolve(page, id, signal);
            metadata.set(id, resolved);
            return resolved;
          },
          close: () => page.close(),
        };
      },
      persist: (input) => persist.persist(input),
      initialize: (snapshot) => initialize.initialize(snapshot),
      refreshMetadata: (member) => metadataRefresh.refresh(member),
      project: async (signal) => {
        await projectionNotification.run(signal);
      },
    };
    return new SyncCycleExecutor(adapters, { ...config, logger }).run(signal);
  }
}
