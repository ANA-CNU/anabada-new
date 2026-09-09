import type { AccountInitialSnapshot } from "./domain/sync.js";
import { PersistenceError } from "./mysql/account-types.js";
import type { AccountUnitOfWork } from "./mysql/unit-of-work.js";
import { AcRatingTierMapper } from "./scoring/tier.js";

/** 요약 기준선은 epoch로 저장해 실제 제출·초기 점수·이벤트와 절대로 혼동하지 않는다. */
export class AccountInitializationService {
  constructor(
    private readonly unitOfWork: AccountUnitOfWork,
    private readonly ratingTierMapper = new AcRatingTierMapper(),
  ) {}

  async initialize(snapshot: AccountInitialSnapshot): Promise<void> {
    await this.unitOfWork.execute(async (repositories) => {
      const { member } = snapshot.plan;
      if (
        snapshot.plan.mode !== "initial_summary" ||
        snapshot.plan.cursorBefore !== 0n ||
        snapshot.plan.maxPages !== 1 ||
        snapshot.plan.expectedSolvedDelta !== member.solvedCount
      )
        throw new PersistenceError("account_conflict");
      if (this.ratingTierMapper.toTier(member.acRating) !== member.tier)
        throw new PersistenceError("rating_tier_mismatch");
      const user = await repositories.users.upsertAndLock(member);
      const distinctSolved = new Map(
        snapshot.solved.map((problem) => [problem.problemId, problem]),
      );
      if (
        user.corrects !== 0 ||
        user.submissions !== 0 ||
        BigInt(user.solution) !== 0n ||
        (await repositories.attempts.readProblemCount(user.id)) !== 0 ||
        snapshot.solved.length !== member.solvedCount ||
        distinctSolved.size !== member.solvedCount
      )
        throw new PersistenceError("account_conflict");
      await repositories.attempts.insertInitialSolved({
        userId: user.id,
        userTier: member.tier,
        solved: [...distinctSolved.values()],
      });
      await repositories.users.completeSync({
        userId: user.id,
        member,
        highestInspectedSubmissionId: snapshot.highestInspectedSubmissionId,
      });
    });
  }
}
