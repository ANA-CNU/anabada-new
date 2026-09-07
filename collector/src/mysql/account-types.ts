import { AccountCrawlResult } from "../domain/sync.js";

export type { AcceptedAttempt } from "../domain/sync.js";

/** 완결된 브라우저 결과에 transaction 실행 시각과 취소 신호만 덧붙이는 입력 객체다. */
export class PersistAccountInput extends AccountCrawlResult {
  constructor(
    result: AccountCrawlResult,
    readonly now?: Date,
    readonly signal?: AbortSignal,
  ) {
    super(
      result.plan,
      result.acceptedAttempts,
      result.highestInspectedSubmissionId,
      result.scannedAttemptCount,
      result.pageCount,
    );
  }
}
export class PersistenceError extends Error {
  constructor(
    readonly code:
      | "rank_mismatch"
      | "stale_snapshot"
      | "account_conflict"
      | "submission_conflict"
      | "score_conflict"
      | "rating_tier_mismatch",
  ) {
    super(code);
    this.name = "PersistenceError";
  }
}
