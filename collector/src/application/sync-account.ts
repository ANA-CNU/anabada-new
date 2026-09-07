import {
  AcceptedAttempt,
  AccountCrawlResult,
  type AccountSyncPlan,
  type AccountSyncState,
} from "../domain/sync.js";
import type { ProblemId } from "../domain.js";
import type { ProblemMetadata } from "../jungol/metadata.js";
import {
  PersistAccountInput,
  PersistenceError,
} from "../mysql/account-types.js";
import { SyncPlanner } from "../sync-plan.js";
import type { CycleAdapters } from "./cycle-types.js";

export type AccountJob = {
  readonly plan: AccountSyncPlan;
  readonly previous: AccountSyncState | null;
};
export type AccountContext = {
  readonly adapters: CycleAdapters;
  readonly signal: AbortSignal;
  readonly refresh: CycleAdapters["rank"];
};
/** 사용자별 page를 단독 소유하고 모든 네트워크 작업을 transaction 전에 끝낸다. */
export class AccountSyncWorker {
  constructor(
    private readonly job: AccountJob,
    private readonly context: AccountContext,
  ) {}

  async run() {
    const { adapters, signal } = this.context;
    let current = this.job;
    for (let retry = 0; retry < 2; retry++) {
      signal.throwIfAborted();
      const browser = await adapters.browser();
      let input: PersistAccountInput;
      let scannedCount: number;
      let pageCount: number;
      try {
        const collected = await browser.collect(current.plan, signal);
        const accepted = collected.attempts.filter(
          (attempt) => attempt.verdict === "accepted",
        );
        const metadata = new Map<ProblemId, ProblemMetadata>();
        for (const id of new Set(accepted.map((attempt) => attempt.problemId)))
          metadata.set(id, await browser.metadata(id, signal));
        scannedCount = collected.attempts.length;
        pageCount = collected.pageCount;
        const acceptedAttempts = accepted.map((attempt) => {
          const resolved = metadata.get(attempt.problemId);
          return new AcceptedAttempt(
            attempt.submissionId,
            attempt.problemId,
            resolved?.title ?? null,
            resolved?.tier ?? 0,
            attempt.submittedAt,
            attempt.score,
          );
        });
        input = new PersistAccountInput(
          new AccountCrawlResult(
            current.plan,
            acceptedAttempts,
            collected.highestInspectedId,
            collected.attempts.length,
            collected.pageCount,
          ),
          undefined,
          signal,
        );
      } finally {
        await browser.close();
      }
      try {
        const result = await adapters.persist(input);
        return {
          ...result,
          scannedCount,
          pageCount,
          acceptedCount: input.acceptedAttempts.length,
        };
      } catch (error) {
        if (
          !(error instanceof PersistenceError) ||
          error.code !== "rank_mismatch" ||
          retry === 1
        )
          throw error;
        const rank = await this.context.refresh(signal);
        const member = rank.find(
          (candidate) => candidate.accountId === this.job.plan.member.accountId,
        );
        if (!member) throw error;
        const previous =
          (await adapters.stored()).get(member.accountId) ?? null;
        const selection = new SyncPlanner({
          maxPages: this.job.plan.maxPages,
          initialBackfillMaxPages: this.job.plan.maxPages,
        }).plan(member, previous);
        if (
          selection.kind !== "initial_backfill" &&
          selection.kind !== "incremental"
        )
          throw error;
        current = { plan: selection.plan, previous };
      }
    }
    throw new PersistenceError("rank_mismatch");
  }
}
