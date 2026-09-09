import {
  AcceptedAttempt,
  AccountCrawlResult,
  AccountInitialSnapshot,
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
import { AccountFlowFailure, AccountFlowLog } from "./flow-log.js";

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
    const trace = new AccountFlowLog();
    try {
      switch (this.job.plan.mode) {
        case "initial_summary": {
          const result = await this.initialize(trace);
          trace.dispose();
          return result;
        }
        case "incremental": {
          const result = await this.incremental(trace);
          trace.dispose();
          return result;
        }
      }
    } catch (error) {
      const snapshot = trace.failureSnapshot();
      trace.dispose();
      if (!snapshot) throw error;
      throw new AccountFlowFailure(error, snapshot);
    }
  }

  /**
   * 첫 적재는 제출 이력 pagination을 하지 않는다. 해결 목록과 첫 API page만
   * 브라우저에서 확정한 뒤 page를 닫고 transaction을 시작해 장시간 DB lock을 피한다.
   */
  private async initialize(trace: AccountFlowLog) {
    const { adapters, signal } = this.context;
    signal.throwIfAborted();
    const browser = await trace.runStep("browser_open", () =>
      adapters.browser(),
    );
    let initial:
      | {
          readonly snapshot: AccountInitialSnapshot;
          readonly scannedCount: number;
        }
      | undefined;
    let primaryFailure: unknown;
    let hasPrimaryFailure = false;
    try {
      // 커서는 기준선보다 앞선 AC를 절대 건너뛰지 않도록 해결 목록보다 먼저 고정한다.
      const cursor = await trace.runStep("initial_cursor", () =>
        browser.cursor(this.job.plan, signal),
      );
      const solved = await trace.runStep("initial_summary", () =>
        browser.summary(this.job.plan, signal),
      );
      initial = await trace.runStep("prepare_snapshot", async () => ({
        snapshot: new AccountInitialSnapshot(
          this.job.plan,
          solved,
          cursor.highestInspectedSubmissionId,
        ),
        scannedCount: cursor.scannedAttemptCount,
      }));
    } catch (error) {
      primaryFailure = error;
      hasPrimaryFailure = true;
    }
    try {
      await trace.runStep("browser_close", () => browser.close());
    } catch (error) {
      if (!hasPrimaryFailure) {
        primaryFailure = error;
        hasPrimaryFailure = true;
      }
    }
    if (hasPrimaryFailure) throw primaryFailure;
    if (!initial) throw primaryFailure;
    await trace.runStep("initialize_transaction", () =>
      adapters.initialize(initial.snapshot),
    );
    return {
      insertedAttemptCount: initial.snapshot.solved.length,
      duplicateAttemptCount: 0,
      newSolvedCount: initial.snapshot.solved.length,
      scannedCount: initial.scannedCount,
      pageCount: 1,
      acceptedCount: 0,
    };
  }

  /** 증분 경로만 rank mismatch 재조회·재수집을 수행한다. */
  private async incremental(trace: AccountFlowLog) {
    const { adapters, signal } = this.context;
    let current = this.job;
    for (let retry = 0; retry < 2; retry++) {
      signal.throwIfAborted();
      const browser = await trace.runStep("browser_open", () =>
        adapters.browser(),
      );
      let collectedInput:
        | {
            readonly input: PersistAccountInput;
            readonly scannedCount: number;
            readonly pageCount: number;
          }
        | undefined;
      let primaryFailure: unknown;
      let hasPrimaryFailure = false;
      try {
        const collected = await trace.runStep("incremental_collect", () =>
          browser.collect(current.plan, signal),
        );
        const accepted = collected.attempts.filter(
          (attempt) => attempt.verdict === "accepted",
        );
        const metadata = new Map<ProblemId, ProblemMetadata>();
        for (const id of new Set(accepted.map((attempt) => attempt.problemId)))
          metadata.set(
            id,
            await trace.runStep("metadata", () => browser.metadata(id, signal)),
          );
        const scannedCount = collected.attempts.length;
        const pageCount = collected.pageCount;
        collectedInput = await trace.runStep("prepare_attempts", async () => {
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
          return {
            input: new PersistAccountInput(
              new AccountCrawlResult(
                current.plan,
                acceptedAttempts,
                collected.highestInspectedId,
                collected.attempts.length,
                collected.pageCount,
              ),
              undefined,
              signal,
            ),
            scannedCount,
            pageCount,
          };
        });
      } catch (error) {
        primaryFailure = error;
        hasPrimaryFailure = true;
      }
      try {
        await trace.runStep("browser_close", () => browser.close());
      } catch (error) {
        if (!hasPrimaryFailure) {
          primaryFailure = error;
          hasPrimaryFailure = true;
        }
      }
      if (hasPrimaryFailure) throw primaryFailure;
      if (!collectedInput) throw primaryFailure;
      try {
        const result = await trace.runStep("db_persist", () =>
          adapters.persist(collectedInput.input),
        );
        return {
          ...result,
          scannedCount: collectedInput.scannedCount,
          pageCount: collectedInput.pageCount,
          acceptedCount: collectedInput.input.acceptedAttempts.length,
        };
      } catch (error) {
        if (
          !(error instanceof PersistenceError) ||
          error.code !== "rank_mismatch" ||
          retry === 1
        )
          throw error;
        trace.markRecovered();
        const rank = await trace.runStep("rank_refresh", () =>
          this.context.refresh(signal),
        );
        current = await trace.runStep("refresh_state", async () => {
          const member = rank.find(
            (candidate) =>
              candidate.accountId === this.job.plan.member.accountId,
          );
          if (!member) throw error;
          const previous =
            (await adapters.stored()).get(member.accountId) ?? null;
          const selection = new SyncPlanner({
            maxPages: this.job.plan.maxPages,
          }).plan(member, previous);
          if (selection.kind !== "incremental") throw error;
          return { plan: selection.plan, previous };
        });
      }
    }
    throw new PersistenceError("rank_mismatch");
  }
}
