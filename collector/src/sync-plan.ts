import {
  AccountSyncPlan,
  type AccountSyncState,
  type RankMember,
} from "./domain/sync.js";

export type SyncSelection =
  | { readonly kind: "initial_summary"; readonly plan: AccountSyncPlan }
  | { readonly kind: "incremental"; readonly plan: AccountSyncPlan }
  | { readonly kind: "metadata_refresh"; readonly member: RankMember }
  | {
      readonly kind: "rank_regression";
      readonly member: RankMember;
      readonly previousSolvedCount: number;
    };
/** 랭킹과 저장 상태의 차이만 판단하며 브라우저나 DB를 직접 호출하지 않는다. */
export class SyncPlanner {
  constructor(private readonly limits: { readonly maxPages: number }) {}

  plan(member: RankMember, previous: AccountSyncState | null): SyncSelection {
    if (previous === null)
      return {
        kind: "initial_summary",
        plan: new AccountSyncPlan(
          "initial_summary",
          member,
          0n,
          member.solvedCount,
          1,
        ),
      };
    if (member.solvedCount < previous.solvedCount)
      return {
        kind: "rank_regression",
        member,
        previousSolvedCount: previous.solvedCount,
      };
    if (member.solvedCount === previous.solvedCount)
      return { kind: "metadata_refresh", member };
    return {
      kind: "incremental",
      plan: new AccountSyncPlan(
        "incremental",
        member,
        previous.lastSubmissionId,
        member.solvedCount - previous.solvedCount,
        this.limits.maxPages,
      ),
    };
  }
}
