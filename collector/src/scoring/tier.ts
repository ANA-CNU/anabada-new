const TIER_THRESHOLDS = [
  0, 30, 60, 90, 120, 150, 200, 300, 400, 500, 650, 800, 950, 1100, 1250, 1400,
  1600, 1750, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800, 2850,
  2900, 2950, 3000,
] as const;

/** Jungol의 원본 AC Rating을 서비스가 사용하는 0~31 티어로 변환한다. */
export class AcRatingTierMapper {
  /** 원본 레이팅은 보존하고, 점수 정책에는 이 메서드가 반환한 티어만 전달한다. */
  toTier(acRating: number): number {
    if (!Number.isSafeInteger(acRating) || acRating < 0)
      throw new RangeError("invalid_ac_rating");
    for (let tier = TIER_THRESHOLDS.length - 1; tier >= 0; tier -= 1) {
      const threshold = TIER_THRESHOLDS[tier];
      if (threshold !== undefined && acRating >= threshold) return tier;
    }
    throw new RangeError("invalid_ac_rating");
  }
}
