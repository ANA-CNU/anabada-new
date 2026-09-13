import type { AccountInitializationService } from "../account-initialization.js";
import type { AccountSettlementService } from "../account-settlement.js";
import { MonthlyScoreCacheService } from "../monthly-score-cache.js";
import {
  CommitUnknownError,
  PersistenceError,
} from "../mysql/account-types.js";
import {
  type CollectorCheckpoint,
  GroupFeedRepository,
  type SettlementInboxRow,
} from "../mysql/group-feed.js";
import type { AccountUnitOfWork } from "../mysql/unit-of-work.js";
import { UserRepository } from "../mysql/users.js";
import type { ProjectionResult } from "../projection.js";
import type { KstCalendar } from "../scoring/daily.js";
import type { SettlementAttemptOutcome } from "../settlement-outcome.js";
import type { CycleTrace } from "./cycle-diagnostics.js";
import type { PreparedCycle, PreparedSettlement } from "./cycle-preparation.js";

export type CycleCommitResult = {
  readonly acceptedCount: number;
  readonly scannedPageCount: number;
  readonly insertedAttemptCount: number;
  readonly duplicateAttemptCount: number;
  readonly settlementOutcomes: readonly SettlementAttemptOutcome[];
  readonly initializedAccountCount: number;
  readonly initializedSolvedCount: number;
  readonly settledUserCount: number;
  readonly inboxEmpty: boolean;
  readonly finalized: boolean;
  readonly pending: boolean;
  readonly projection: ProjectionResult | null;
};

/** 모든 영속 변경은 이 서비스가 소유한 단일 transaction에서만 확정한다. */
export class CycleCommitService {
  constructor(
    private readonly dependencies: {
      readonly groupId: string;
      readonly unitOfWork: AccountUnitOfWork;
      readonly initialization: AccountInitializationService;
      readonly settlement: AccountSettlementService;
      readonly calendar: KstCalendar;
      readonly projectOnConnection?: (
        connection: import("mysql2/promise").PoolConnection,
        now: Date,
      ) => Promise<ProjectionResult>;
    },
  ) {}

  async commit(
    prepared: PreparedCycle,
    signal: AbortSignal,
    onTransactionActive?: () => void,
    trace?: CycleTrace,
    onRollbackFailed?: () => void,
  ): Promise<CycleCommitResult> {
    signal.throwIfAborted();
    return this.dependencies.unitOfWork.executeConnection(
      (connection) =>
        this.commitOnConnection(connection, prepared, signal, trace),
      () => signal.throwIfAborted(),
      onTransactionActive,
      onRollbackFailed,
      trace,
    );
  }

  private async commitOnConnection(
    connection: import("mysql2/promise").PoolConnection,
    prepared: PreparedCycle,
    signal: AbortSignal,
    trace: CycleTrace | undefined,
  ): Promise<CycleCommitResult> {
    const feed = new GroupFeedRepository(connection);
    const checkpoint = await this.stage(trace, "snapshot_recheck", async () => {
      const current = await feed.lockCheckpoint(this.dependencies.groupId);
      this.assertCheckpoint(prepared.collection.checkpoint, current);
      return current;
    });
    if (!checkpoint) {
      if (prepared.collection.head === null)
        throw new PersistenceError("stale_snapshot");
      await feed.insertCheckpoint(
        this.dependencies.groupId,
        prepared.collection.head.toString(),
      );
    }
    const users = new UserRepository(connection);
    await this.stage(trace, "user_lock", async () => {
      const current = await users.lockRegisteredMembers(prepared.members);
      this.assertUserSnapshots(
        prepared,
        current.users,
        current.insertedAccountIds,
      );
      return current;
    });
    for (const initialization of prepared.initializations)
      await this.stage(
        trace,
        "user_initialization",
        () =>
          this.dependencies.initialization.initializeOnConnection(
            connection,
            initialization.snapshot,
          ),
        { accountId: initialization.snapshot.plan.member.accountId },
      );
    const collectionNext = prepared.collection.next;
    if (collectionNext) {
      await this.stage(trace, "inbox_write", () =>
        feed.appendInbox(
          this.dependencies.groupId,
          prepared.collection.accepted,
        ),
      );
      await this.stage(trace, "checkpoint_advance", () =>
        feed.advanceCollection({
          groupId: this.dependencies.groupId,
          ...collectionNext,
        }),
      );
    }
    const settlementRows = prepared.collection.complete
      ? await feed.readSettlementBatch(this.dependencies.groupId)
      : [];
    if (prepared.collection.complete)
      this.assertSettlementSnapshot(prepared.settlements, settlementRows);
    let insertedAttemptCount = 0;
    let duplicateAttemptCount = 0;
    const settlementOutcomes: SettlementAttemptOutcome[] = [];
    if (prepared.collection.complete) {
      for (const settlement of prepared.settlements) {
        signal.throwIfAborted();
        const result = await this.stage(trace, "attempt_insert", () =>
          this.dependencies.settlement.commitOnConnection(connection, {
            member: settlement.member,
            attempts: settlement.attempts,
            highestSubmissionId: settlement.highestSubmissionId,
            now: prepared.preparedAt,
            signal,
            ...(trace ? { trace } : {}),
          }),
        );
        insertedAttemptCount += result.insertedAttemptCount;
        duplicateAttemptCount += result.duplicateAttemptCount;
        settlementOutcomes.push(...result.outcomes);
      }
    }
    const inboxEmpty =
      (await feed.readSettlementBatch(this.dependencies.groupId, 1, 1))
        .length === 0;
    const finalized =
      prepared.collection.complete && inboxEmpty
        ? await this.stage(trace, "checkpoint_finalize", () =>
            feed.finalizeWhenInboxEmpty(this.dependencies.groupId),
          )
        : false;
    await this.stage(trace, "monthly_cache", () =>
      new MonthlyScoreCacheService(
        connection,
        this.dependencies.calendar,
      ).rebuildStale(prepared.preparedAt),
    );
    const projection = this.dependencies.projectOnConnection
      ? await this.stage(
          trace,
          "ranking_projection",
          () =>
            this.dependencies.projectOnConnection?.(
              connection,
              prepared.preparedAt,
            ) ?? Promise.reject(new RangeError("missing_atomic_projection")),
        )
      : null;
    return {
      acceptedCount: prepared.collection.accepted.length,
      scannedPageCount: prepared.collection.scannedPageCount,
      insertedAttemptCount,
      duplicateAttemptCount,
      settlementOutcomes,
      initializedAccountCount: prepared.initializations.length,
      initializedSolvedCount: prepared.initializations.reduce(
        (count, initialization) =>
          count + initialization.snapshot.solved.length,
        0,
      ),
      settledUserCount: prepared.collection.complete
        ? prepared.settlements.length
        : 0,
      inboxEmpty,
      finalized,
      pending: !prepared.collection.complete || !inboxEmpty || !finalized,
      projection,
    };
  }

  private assertCheckpoint(
    expected: CollectorCheckpoint | null,
    actual: CollectorCheckpoint | null,
  ): void {
    if (!expected && !actual) return;
    if (!expected || !actual || !this.sameCheckpoint(expected, actual))
      throw new PersistenceError("stale_snapshot");
  }

  private sameCheckpoint(
    left: CollectorCheckpoint,
    right: CollectorCheckpoint,
  ): boolean {
    return (
      left.committedCursor === right.committedCursor &&
      left.upperSubmissionId === right.upperSubmissionId &&
      left.windowLowerCursor === right.windowLowerCursor &&
      left.paginationCursor === right.paginationCursor &&
      left.lastScannedSubmissionId === right.lastScannedSubmissionId &&
      left.phase === right.phase &&
      left.overlapObservedCount === right.overlapObservedCount &&
      left.cursorReached === right.cursorReached
    );
  }

  private assertSettlementSnapshot(
    expected: readonly PreparedSettlement[],
    actual: readonly SettlementInboxRow[],
  ): void {
    const expectedIds = expected
      .flatMap((settlement) =>
        settlement.attempts.map((attempt) =>
          [
            attempt.submissionId,
            settlement.member.accountId,
            attempt.problemId,
            attempt.submittedAt.getTime(),
            attempt.score,
          ].join(":"),
        ),
      )
      .sort();
    const actualIds = actual
      .map((row) =>
        [
          row.externalSubmissionId,
          row.accountId,
          row.problemId,
          row.submittedAt.getTime(),
          row.score,
        ].join(":"),
      )
      .sort();
    if (
      expectedIds.length !== actualIds.length ||
      expectedIds.some((id, index) => id !== actualIds[index])
    )
      throw new PersistenceError("stale_snapshot");
  }

  private assertUserSnapshots(
    prepared: PreparedCycle,
    lockedUsers: readonly import("../mysql/users.js").LockedUser[],
    insertedAccountIds: ReadonlySet<string>,
  ): void {
    const actual = new Map(lockedUsers.map((user) => [user.accountId, user]));
    for (const [index, member] of prepared.members.entries()) {
      const expected = prepared.userStates[index];
      const user = actual.get(member.accountId);
      if (!user) throw new PersistenceError("stale_snapshot");
      if (!expected) {
        if (!insertedAccountIds.has(member.accountId))
          throw new PersistenceError("stale_snapshot");
        continue;
      }
      if (
        expected.id !== user.id ||
        expected.solution !== user.solution ||
        expected.corrects !== user.corrects ||
        expected.submissions !== user.submissions ||
        expected.tier !== user.tier ||
        expected.initializedAt?.getTime() !== user.initializedAt?.getTime() ||
        expected.initialSubmissionId !== user.initialSubmissionId
      )
        throw new PersistenceError("stale_snapshot");
    }
  }

  private stage<T>(
    trace: CycleTrace | undefined,
    name: string,
    operation: () => Promise<T>,
    context: import("./cycle-diagnostics.js").SafeCycleContext = {},
  ): Promise<T> {
    return trace ? trace.run(name, context, operation) : operation();
  }
}

export function isCommitUnknown(error: unknown): error is CommitUnknownError {
  return error instanceof CommitUnknownError;
}
