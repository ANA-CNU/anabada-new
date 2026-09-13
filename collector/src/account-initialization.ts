import type { PoolConnection } from "mysql2/promise";
import type { AccountInitialSnapshot } from "./domain/sync.js";
import { PersistenceError } from "./mysql/account-types.js";
import { AttemptRepository } from "./mysql/attempts.js";
import type { AccountUnitOfWork } from "./mysql/unit-of-work.js";
import { UserRepository } from "./mysql/users.js";
import { AcRatingTierMapper } from "./scoring/tier.js";

/** 요약 기준선은 epoch로 저장해 실제 제출·초기 점수·이벤트와 절대로 혼동하지 않는다. */
export class AccountInitializationService {
  constructor(
    private readonly unitOfWork: AccountUnitOfWork,
    private readonly ratingTierMapper = new AcRatingTierMapper(),
  ) {}

  async initialize(snapshot: AccountInitialSnapshot): Promise<void> {
    await this.unitOfWork.executeConnection((connection) =>
      this.initializeOnConnection(connection, snapshot),
    );
  }

  async initializeOnConnection(
    connection: PoolConnection,
    snapshot: AccountInitialSnapshot,
  ): Promise<void> {
    const { member } = snapshot.plan;
    if (
      snapshot.plan.mode !== "initial_summary" ||
      snapshot.plan.cursorBefore !== 0n ||
      snapshot.plan.maxPages !== 1 ||
      snapshot.plan.expectedSolvedDelta < 0
    )
      throw new PersistenceError("account_conflict");
    if (this.ratingTierMapper.toTier(member.acRating) !== member.tier)
      throw new PersistenceError("rating_tier_mismatch");
    const users = new UserRepository(connection);
    const attempts = new AttemptRepository(connection);
    const user = await users.upsertAndLock(member);
    if (user.initializedAt !== null && user.initialSubmissionId !== null)
      return;
    if (user.initializedAt !== null || user.initialSubmissionId !== null)
      throw new PersistenceError("account_conflict");
    const distinctSolved = new Map(
      snapshot.solved.map((problem) => [problem.problemId, problem]),
    );
    if (
      user.corrects !== 0 ||
      user.submissions !== 0 ||
      BigInt(user.solution) !== 0n ||
      (await attempts.readProblemCount(user.id)) !== 0 ||
      distinctSolved.size !== snapshot.solved.length
    )
      throw new PersistenceError("account_conflict");
    await attempts.insertInitialSolved({
      userId: user.id,
      userTier: member.tier,
      solved: [...distinctSolved.values()],
    });
    await users.completeInitialization({
      userId: user.id,
      member,
      solvedCount: distinctSolved.size,
      highestInspectedSubmissionId: snapshot.highestInspectedSubmissionId,
      initializedAt: new Date(),
    });
  }
}
