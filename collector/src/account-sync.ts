import {
  type PersistAccountInput,
  PersistenceError,
} from "./mysql/account-types.js";
import type { AccountUnitOfWork } from "./mysql/unit-of-work.js";
import { DailyScorePolicy, type KstCalendar } from "./scoring/daily.js";
import { EventManager } from "./scoring/events.js";
import { AcRatingTierMapper } from "./scoring/tier.js";

export type { PersistAccountInput } from "./mysql/account-types.js";

export type PersistResult = {
  readonly insertedAttemptCount: number;
  readonly duplicateAttemptCount: number;
  readonly newSolvedCount: number;
};

/** 랭킹의 distinct 해결 수와 저장된 AC 행 수를 분리해 사용자 transaction을 조정한다. */
export class AccountSyncService {
  constructor(
    private readonly unitOfWork: AccountUnitOfWork,
    private readonly calendar: KstCalendar,
    private readonly ratingTierMapper = new AcRatingTierMapper(),
    private readonly dailyScorePolicy = new DailyScorePolicy(calendar),
  ) {}

  async persist(input: PersistAccountInput): Promise<PersistResult> {
    input.signal?.throwIfAborted();
    if (input.plan.mode !== "incremental")
      throw new PersistenceError("account_conflict");
    return this.unitOfWork.execute(async (repositories) => {
      const { plan } = input;
      const { member } = plan;
      if (this.ratingTierMapper.toTier(member.acRating) !== member.tier)
        throw new PersistenceError("rating_tier_mismatch");
      const user = await repositories.users.upsertAndLock(member);
      const cursor = BigInt(user.solution);
      if (
        input.highestInspectedSubmissionId < cursor ||
        plan.cursorBefore > cursor ||
        input.acceptedAttempts.some(
          (attempt) =>
            BigInt(attempt.submissionId) > input.highestInspectedSubmissionId,
        )
      )
        throw new PersistenceError("stale_snapshot");
      const solved = await repositories.attempts.readSolvedCounts(user.id);
      const duplicates = await repositories.attempts.readDuplicates(
        user.id,
        input.acceptedAttempts,
      );
      const attempts = [...input.acceptedAttempts].sort(
        (a, b) =>
          a.submittedAt.getTime() - b.submittedAt.getTime() ||
          (BigInt(a.submissionId) < BigInt(b.submissionId) ? -1 : 1),
      );
      const discovered = new Set(
        attempts
          .filter(
            (attempt) =>
              !duplicates.has(attempt.submissionId) &&
              !solved.has(attempt.problemId),
          )
          .map((attempt) => attempt.problemId),
      );
      const delta = member.solvedCount - user.corrects;
      const replayOfCommittedPlan = cursor > plan.cursorBefore;
      if (
        (!replayOfCommittedPlan &&
          (delta !== discovered.size || delta !== plan.expectedSolvedDelta)) ||
        (replayOfCommittedPlan && (delta !== 0 || discovered.size !== 0))
      )
        throw new PersistenceError("rank_mismatch");
      const events = new EventManager(
        await repositories.events.readForProblems([
          ...new Set(attempts.map((attempt) => attempt.problemId)),
        ]),
        this.calendar,
      );
      const dailyDays = await repositories.scores.readDailyDays(user.id);
      let insertedAttemptCount = 0;
      for (const attempt of attempts) {
        input.signal?.throwIfAborted();
        if (duplicates.has(attempt.submissionId)) continue;
        const repetition = solved.get(attempt.problemId) ?? 0;
        const problemId = await repositories.attempts.insert({
          userId: user.id,
          userTier: member.tier,
          attempt,
          repetition,
        });
        if (problemId === null) continue;
        insertedAttemptCount += 1;
        solved.set(attempt.problemId, repetition + 1);
        const dailyAward = this.dailyScorePolicy.evaluate({
          userId: user.id,
          problemRowId: problemId,
          problemNumber: attempt.problemId,
          submittedAt: attempt.submittedAt,
          firstSolve: repetition === 0,
          problemTier: attempt.problemTier,
          userTier: member.tier,
          alreadyAwarded: dailyDays.has(this.calendar.day(attempt.submittedAt)),
        });
        if (dailyAward) {
          await repositories.scores.insert(dailyAward);
          dailyDays.add(dailyAward.scoreDay);
        }
        for (const eventAward of events.detect({
          syncMode: plan.mode,
          userId: user.id,
          problemRowId: problemId,
          problemNumber: attempt.problemId,
          submittedAt: attempt.submittedAt,
        }))
          await repositories.scores.insert(eventAward);
      }
      const now = input.now ?? new Date();
      await repositories.users.completeSync({
        userId: user.id,
        member,
        highestInspectedSubmissionId: input.highestInspectedSubmissionId,
      });
      await repositories.bias.refreshUser(user.id, now);
      input.signal?.throwIfAborted();
      return {
        insertedAttemptCount,
        duplicateAttemptCount: attempts.length - insertedAttemptCount,
        newSolvedCount: delta,
      };
    });
  }
}
