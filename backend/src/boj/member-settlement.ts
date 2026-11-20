import {
  DailyScorePolicy,
  EventManager,
  KstCalendar,
} from "../../../shared/automatic-scoring.js";
import type { DatabasePool } from "../infrastructure/mysql/database-session.js";
import { MonthlyScoreCacheRepository } from "../infrastructure/mysql/repositories/monthly-score-cache.js";
import type { MemberSettlement } from "./member-sync.js";
import {
  BojSettlementConflict,
  BojSettlementRepository,
} from "./settlement-repository.js";
import type { SettlementTiers } from "./solved-ac.js";

export class BojMemberSettlement {
  private readonly calendar = new KstCalendar();
  private readonly daily = new DailyScorePolicy(this.calendar);

  constructor(private readonly pool: DatabasePool) {}

  async commit(
    input: MemberSettlement,
    tiers: SettlementTiers | undefined,
    now: Date,
    signal?: AbortSignal,
  ): Promise<number> {
    signal?.throwIfAborted();
    return this.pool.unitOfWork(async (db) => {
      const repo = new BojSettlementRepository(db);
      const user = await repo.member(input.member.handle, true);
      if (!user?.baselineReady || user.solution !== input.expectedCursor)
        throw new BojSettlementConflict("cursor_changed");
      const lower = BigInt(input.expectedCursor);
      const upper = BigInt(input.committedThrough);
      if (
        upper < lower ||
        input.accepted.some(
          ({ id }) => BigInt(id) <= lower || BigInt(id) > upper,
        )
      )
        throw new BojSettlementConflict("invalid_attempt");

      const ordered = [...input.accepted].sort((a, b) => {
        const byTime = a.submittedAt.getTime() - b.submittedAt.getTime();
        if (byTime || a.id === b.id) return byTime;
        return BigInt(a.id) < BigInt(b.id) ? -1 : 1;
      });
      const counts = await repo.solvedCounts(user.id);
      const days = ordered.length
        ? await repo.awardedDays(user.id)
        : new Set<string>();
      const events = new EventManager(
        await repo.events([
          ...new Set(ordered.map(({ problemNumber }) => problemNumber)),
        ]),
        this.calendar,
      );
      let inserted = 0;
      for (const attempt of ordered) {
        signal?.throwIfAborted();
        if (await repo.alreadySaved(user.id, attempt)) continue;
        const metadata = tiers?.problems.get(attempt.problemNumber);
        if (!tiers || !metadata)
          throw new BojSettlementConflict("invalid_attempt");
        const userTier = tiers.profile.tier;
        const previous = counts.get(attempt.problemNumber);
        const observedEarlier =
          previous?.observedAt != null &&
          previous.observedAt < attempt.submittedAt;
        const observationId = observedEarlier
          ? null
          : (previous?.observationId ?? null);
        const repetition = (previous?.total ?? 0) + Number(observedEarlier);
        const problemRowId = await repo.save(
          user.id,
          attempt,
          metadata,
          repetition,
          userTier,
          observationId,
        );
        counts.set(attempt.problemNumber, {
          total: (previous?.total ?? 0) + 1,
          observationId: observedEarlier
            ? (previous?.observationId ?? null)
            : null,
          observedAt: observedEarlier ? (previous?.observedAt ?? null) : null,
        });
        inserted += 1;

        if (BigInt(attempt.id) <= BigInt(user.baseline)) continue;
        const scoring = {
          userId: user.id,
          problemRowId,
          problemNumber: attempt.problemNumber,
          submittedAt: attempt.submittedAt,
        };
        const day = this.calendar.day(attempt.submittedAt);
        const award = this.daily.evaluate({
          ...scoring,
          firstSolve: repetition === 0,
          problemTier: metadata.tier,
          userTier,
          alreadyAwarded: days.has(day),
        });
        if (award) {
          await repo.award(award);
          days.add(day);
        }
        for (const event of events.detect({
          ...scoring,
          syncMode: "incremental",
        }))
          await repo.award(event);
      }
      signal?.throwIfAborted();
      await repo.complete(
        user,
        input,
        tiers?.profile,
        now,
        input.member.solvedCount - counts.size,
      );
      await new MonthlyScoreCacheRepository(db).refreshUsers([user.id], now);
      signal?.throwIfAborted();
      return inserted;
    });
  }
}
