export type RankingScore = { readonly userId: number; readonly score: number };

/** 월 점수를 기존 1.05 지수 가중치와 결정적 seed로 내부 순서에 투영한다. */
export class WeightedRankingPolicy {
  rank(users: readonly RankingScore[], seed: string): readonly number[] {
    let state = 1779033703 ^ seed.length;
    for (let index = 0; index < seed.length; index += 1) {
      state = Math.imul(state ^ seed.charCodeAt(index), 3432918353);
      state = (state << 13) | (state >>> 19);
    }
    const weighted: number[] = [];
    for (const user of users) {
      const weight = Math.floor(user.score ** 1.05);
      for (let index = 0; index < weight; index += 1)
        weighted.push(user.userId);
    }
    for (let index = weighted.length - 1; index > 0; index -= 1) {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      const random = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      const target = Math.floor(random * (index + 1));
      const left = weighted[index];
      const right = weighted[target];
      if (left === undefined || right === undefined)
        throw new RangeError("Invalid shuffle index");
      weighted[index] = right;
      weighted[target] = left;
    }
    return [...new Set(weighted)];
  }
}
