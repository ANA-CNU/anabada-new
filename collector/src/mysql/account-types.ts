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

/** COMMIT 응답이 끊기면 DB 반영 여부를 판정할 수 없어 rollback으로 단정하지 않는다. */
export class CommitUnknownError extends Error {
  constructor(readonly cause: unknown) {
    super("commit_unknown");
    this.name = "CommitUnknownError";
  }
}
