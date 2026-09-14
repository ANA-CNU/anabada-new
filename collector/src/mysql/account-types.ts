export class PersistenceError extends Error {
  constructor(
    readonly code:
      | "account_conflict"
      | "stale_snapshot"
      | "submission_conflict"
      | "score_conflict",
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
