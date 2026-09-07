import type { RankMemberSnapshot } from "../domain/sync.js";
import { PersistenceError } from "../mysql/account-types.js";
import type { AccountUnitOfWork } from "../mysql/unit-of-work.js";
import { AcRatingTierMapper } from "../scoring/tier.js";

/** 제출 cursor와 누적 수치를 건드리지 않고 랭킹 메타데이터 네 칸만 갱신한다. */
export class MetadataRefreshService {
  constructor(
    private readonly unitOfWork: AccountUnitOfWork,
    private readonly ratingTierMapper = new AcRatingTierMapper(),
  ) {}

  refresh(member: RankMemberSnapshot): Promise<void> {
    if (this.ratingTierMapper.toTier(member.acRating) !== member.tier)
      throw new PersistenceError("rating_tier_mismatch");
    return this.unitOfWork.execute(async ({ users }) => {
      await users.lockExisting(member.accountId);
      await users.refreshMetadata(member);
    });
  }
}
