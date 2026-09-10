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

export type PreparedAccountBatch = {
  readonly member: RankMemberSnapshot;
  readonly attempts: readonly AcceptedAttempt[];
  readonly highestSubmissionId: bigint;
  readonly now: Date;
  readonly signal?: AbortSignal;
};

export type AccountSettlementResult = {
  readonly insertedAttemptCount: number;
  readonly duplicateAttemptCount: number;
};

export function orderAcceptedAttempts(
  attempts: readonly AcceptedAttempt[],
): readonly AcceptedAttempt[] {
  return [...attempts].sort(
    (left, right) =>
      left.submittedAt.getTime() - right.submittedAt.getTime() ||
      (BigInt(left.submissionId) < BigInt(right.submissionId) ? -1 : 1),
  );
}

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
    return this.unitOfWork.executeConnection(async (connection) => {
      const users = new UserRepository(connection);
      const user = await users.lockExisting(batch.member.accountId);
      if (user.initializedAt === null || user.initialSubmissionId === null)
        throw new PersistenceError("account_conflict");
      if (
        this.ratingTierMapper.toTier(batch.member.acRating) !==
        batch.member.tier
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
      for (const attempt of orderedAttempts) {
        batch.signal?.throwIfAborted();
        if (duplicates.has(attempt.submissionId)) continue;
        const repetition = solved.get(attempt.problemId) ?? 0;
        const tier = batch.member.tier;
        const problemRowId = await attemptRepository.insert({
          userId: user.id,
          userTier: tier,
          attempt,
          repetition,
        });
        if (problemRowId === null) continue;
        insertedAttemptCount += 1;
        solved.set(attempt.problemId, repetition + 1);
        if (BigInt(attempt.submissionId) <= cutoff) continue;
        const daily = this.dailyPolicy.evaluate({
          userId: user.id,
          problemRowId,
          problemNumber: attempt.problemId,
          submittedAt: attempt.submittedAt,
          firstSolve: repetition === 0,
          problemTier: attempt.estimatedTier,
          userTier: tier,
          alreadyAwarded: awardedDays.has(
            this.calendar.day(attempt.submittedAt),
          ),
        });
        if (daily) {
          await scores.insert(daily);
          awardedDays.add(daily.scoreDay);
        }
        for (const award of events.detect({
          syncMode: "incremental",
          userId: user.id,
          problemRowId,
          problemNumber: attempt.problemId,
          submittedAt: attempt.submittedAt,
        }))
          await scores.insert(award);
      }
      const cursor =
        batch.highestSubmissionId > BigInt(user.solution)
          ? batch.highestSubmissionId
          : BigInt(user.solution);
      await users.completeSync({
        userId: user.id,
        member: batch.member,
        highestInspectedSubmissionId: cursor,
      });
      await new BiasRepository(connection, this.calendar).refreshUser(
        user.id,
        batch.now,
      );
      await new GroupFeedRepository(connection).deleteInboxForAccount(
        this.groupId,
        batch.member.accountId,
        batch.attempts.map((attempt) => attempt.submissionId),
      );
      batch.signal?.throwIfAborted();
      return {
        insertedAttemptCount,
        duplicateAttemptCount: orderedAttempts.length - insertedAttemptCount,
      };
    });
  }
}
