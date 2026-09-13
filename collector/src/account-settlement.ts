import type { PoolConnection } from "mysql2/promise";
import type { CycleTrace } from "./application/cycle-diagnostics.js";
import type { AcceptedAttempt, RankMemberSnapshot } from "./domain/sync.js";
import { PersistenceError } from "./mysql/account-types.js";
import { AttemptRepository } from "./mysql/attempts.js";
import {
  BiasRepository,
  EventRepository,
  ScoreHistoryRepository,
} from "./mysql/awards.js";
import { GroupFeedRepository } from "./mysql/group-feed.js";
import type { AccountUnitOfWork } from "./mysql/unit-of-work.js";
import { UserRepository } from "./mysql/users.js";
import { DailyScorePolicy, type KstCalendar } from "./scoring/daily.js";
import { EventManager } from "./scoring/events.js";
import { AcRatingTierMapper } from "./scoring/tier.js";
import {
  dailyOutcomeFromDecision,
  orderAcceptedAttempts,
  type SettlementAttemptOutcome,
  type SettlementDailyOutcome,
} from "./settlement-outcome.js";

export type {
  SettlementAttemptOutcome,
  SettlementDailyOutcome,
} from "./settlement-outcome.js";
export { orderAcceptedAttempts } from "./settlement-outcome.js";

export type PreparedAccountBatch = {
  readonly member: RankMemberSnapshot;
  readonly attempts: readonly AcceptedAttempt[];
  readonly highestSubmissionId: bigint;
  readonly now: Date;
  readonly signal?: AbortSignal;
  readonly trace?: CycleTrace;
};

export type AccountSettlementResult = {
  readonly insertedAttemptCount: number;
  readonly duplicateAttemptCount: number;
  readonly outcomes: readonly SettlementAttemptOutcome[];
};

/** 준비된 account batch는 사용자 잠금 뒤 원장·점수·cursor·inbox 삭제를 함께 확정한다. */
export class AccountSettlementService {
  constructor(
    private readonly unitOfWork: AccountUnitOfWork,
    private readonly groupId: string,
    private readonly calendar: KstCalendar,
    private readonly ratingTierMapper = new AcRatingTierMapper(),
    private readonly dailyPolicy = new DailyScorePolicy(calendar),
  ) {}

  async commit(batch: PreparedAccountBatch): Promise<AccountSettlementResult> {
    batch.signal?.throwIfAborted();
    return this.unitOfWork.executeConnection((connection) =>
      this.commitOnConnection(connection, batch),
    );
  }

  async commitOnConnection(
    connection: PoolConnection,
    batch: PreparedAccountBatch,
  ): Promise<AccountSettlementResult> {
    const users = new UserRepository(connection);
    const user = await users.lockExisting(batch.member.accountId);
    if (user.initializedAt === null || user.initialSubmissionId === null)
      throw new PersistenceError("account_conflict");
    if (
      this.ratingTierMapper.toTier(batch.member.acRating) !== batch.member.tier
    )
      throw new PersistenceError("rating_tier_mismatch");
    if (
      batch.attempts.some(
        (attempt) => BigInt(attempt.submissionId) > batch.highestSubmissionId,
      )
    )
      throw new PersistenceError("stale_snapshot");
    const orderedAttempts = orderAcceptedAttempts(batch.attempts);
    const attemptRepository = new AttemptRepository(connection);
    const duplicates = await attemptRepository.readDuplicates(
      user.id,
      orderedAttempts,
    );
    const solved = await attemptRepository.readSolvedCounts(user.id);
    const scores = new ScoreHistoryRepository(connection);
    const awardedDays = await scores.readDailyDays(user.id);
    const events = new EventManager(
      await new EventRepository(connection).readForProblems([
        ...new Set(orderedAttempts.map((attempt) => attempt.problemId)),
      ]),
      this.calendar,
    );
    const cutoff = BigInt(user.initialSubmissionId);
    let insertedAttemptCount = 0;
    const outcomes: SettlementAttemptOutcome[] = [];
    for (const attempt of orderedAttempts) {
      batch.signal?.throwIfAborted();
      if (duplicates.has(attempt.submissionId)) continue;
      const repetition = solved.get(attempt.problemId) ?? 0;
      const tier = batch.member.tier;
      const problemRowId = await this.stage(
        batch.trace,
        "attempt_insert",
        {
          accountId: batch.member.accountId,
          submissionId: attempt.submissionId.toString(),
          problemId: attempt.problemId,
          operationId: "attempt_insert",
        },
        () =>
          attemptRepository.insert({
            userId: user.id,
            userTier: tier,
            attempt,
            repetition,
          }),
      );
      if (problemRowId === null) continue;
      insertedAttemptCount += 1;
      solved.set(attempt.problemId, repetition + 1);
      if (BigInt(attempt.submissionId) <= cutoff) {
        outcomes.push(
          this.outcome(
            batch,
            attempt,
            {
              kind: "not_awarded",
              reason: "initial_cutoff",
            },
            [],
          ),
        );
        continue;
      }
      const daily = this.dailyPolicy.decide({
        userId: user.id,
        problemRowId,
        problemNumber: attempt.problemId,
        submittedAt: attempt.submittedAt,
        firstSolve: repetition === 0,
        problemTier: attempt.effectiveTier,
        userTier: tier,
        alreadyAwarded: awardedDays.has(this.calendar.day(attempt.submittedAt)),
      });
      let dailyOutcome: SettlementDailyOutcome;
      if (daily.kind === "award") {
        const persisted = await this.stage(
          batch.trace,
          "daily_score",
          {
            accountId: batch.member.accountId,
            submissionId: attempt.submissionId.toString(),
            problemId: attempt.problemId,
            operationId: "daily_score",
          },
          () => scores.insert(daily.award),
        );
        if (persisted === "inserted") {
          dailyOutcome = { kind: "awarded", scoreDay: daily.award.scoreDay };
        } else
          dailyOutcome = {
            kind: "not_awarded",
            reason: "daily_already_awarded",
          };
        awardedDays.add(daily.award.scoreDay);
      } else dailyOutcome = dailyOutcomeFromDecision(daily);
      const eventIds: number[] = [];
      for (const award of events.detect({
        syncMode: "incremental",
        userId: user.id,
        problemRowId,
        problemNumber: attempt.problemId,
        submittedAt: attempt.submittedAt,
      })) {
        const persisted = await this.stage(
          batch.trace,
          "event_score",
          {
            accountId: batch.member.accountId,
            submissionId: attempt.submissionId.toString(),
            problemId: attempt.problemId,
            operationId: "event_score",
          },
          () => scores.insert(award),
        );
        if (persisted === "inserted" && award.eventId !== null)
          eventIds.push(award.eventId);
      }
      outcomes.push(this.outcome(batch, attempt, dailyOutcome, eventIds));
    }
    const cursor =
      batch.highestSubmissionId > BigInt(user.solution)
        ? batch.highestSubmissionId
        : BigInt(user.solution);
    await this.stage(
      batch.trace,
      "user_counters",
      { accountId: batch.member.accountId, operationId: "user_counters" },
      () =>
        users.completeSync({
          userId: user.id,
          member: batch.member,
          highestInspectedSubmissionId: cursor,
        }),
    );
    await this.stage(
      batch.trace,
      "user_cache",
      { accountId: batch.member.accountId, operationId: "user_cache" },
      () =>
        new BiasRepository(connection, this.calendar).refreshUser(
          user.id,
          batch.now,
        ),
    );
    await this.stage(
      batch.trace,
      "inbox_delete",
      { accountId: batch.member.accountId, operationId: "inbox_delete" },
      () =>
        new GroupFeedRepository(connection).deleteInboxForAccount(
          this.groupId,
          batch.member.accountId,
          batch.attempts.map((attempt) => attempt.submissionId),
        ),
    );
    batch.signal?.throwIfAborted();
    return {
      insertedAttemptCount,
      duplicateAttemptCount: orderedAttempts.length - insertedAttemptCount,
      outcomes,
    };
  }

  private outcome(
    batch: PreparedAccountBatch,
    attempt: AcceptedAttempt,
    daily: SettlementDailyOutcome,
    eventIds: readonly number[],
  ): SettlementAttemptOutcome {
    return {
      accountId: batch.member.accountId,
      jungolName: batch.member.jungolName,
      problemId: attempt.problemId,
      submissionId: attempt.submissionId,
      submittedAt: attempt.submittedAt,
      daily,
      eventIds,
    };
  }

  private stage<T>(
    trace: CycleTrace | undefined,
    stage: string,
    context: import("./application/cycle-diagnostics.js").SafeCycleContext,
    operation: () => Promise<T>,
  ): Promise<T> {
    return trace ? trace.run(stage, context, operation) : operation();
  }
}
