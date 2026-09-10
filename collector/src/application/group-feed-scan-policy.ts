import type { GroupAcceptedSubmission } from "../group-domain.js";

export type GroupFeedPage = {
  readonly submissions: readonly GroupAcceptedSubmission[];
  readonly nextCursor: string | null;
  readonly more: boolean;
};

export type GroupFeedScanState = {
  readonly upperInclusiveSubmissionId: string;
  readonly lowerCursor: string | null;
  readonly paginationCursor: string | null;
  readonly overlapObservedCount: number;
};

export type GroupFeedScanDecision = {
  readonly accepted: readonly GroupAcceptedSubmission[];
  readonly overlapObservedCount: number;
  readonly cursorReached: boolean;
  readonly nextCursor: string | null;
};

export class GroupFeedScanPolicy {
  private static readonly overlapSize = 10;

  decide(
    state: GroupFeedScanState,
    page: GroupFeedPage,
  ): GroupFeedScanDecision {
    this.ensurePaging(state, page);
    this.ensureDescendingSubmissions(page);
    let overlapObservedCount = state.overlapObservedCount;
    const accepted: GroupAcceptedSubmission[] = [];
    for (const submission of page.submissions) {
      if (
        BigInt(submission.submissionId) >
        BigInt(state.upperInclusiveSubmissionId)
      )
        continue;
      if (this.isAtOrAboveLowerCursor(submission.submissionId, state)) {
        accepted.push(submission);
        continue;
      }
      if (overlapObservedCount === GroupFeedScanPolicy.overlapSize) continue;
      accepted.push(submission);
      overlapObservedCount += 1;
    }
    const cursorReached =
      overlapObservedCount === GroupFeedScanPolicy.overlapSize || !page.more;
    return {
      accepted,
      overlapObservedCount,
      cursorReached,
      nextCursor: cursorReached ? null : page.nextCursor,
    };
  }

  static freezeUpper(
    committedCursor: string,
    persistedUpper: string | null,
    page: GroupFeedPage,
  ): string {
    if (persistedUpper !== null) return persistedUpper;
    const head = page.submissions[0]?.submissionId;
    if (head === undefined || BigInt(head) < BigInt(committedCursor))
      return committedCursor;
    return head;
  }

  private isAtOrAboveLowerCursor(
    submissionId: string,
    state: GroupFeedScanState,
  ): boolean {
    if (state.lowerCursor === null) return true;
    return BigInt(submissionId) >= BigInt(state.lowerCursor);
  }

  private ensurePaging(state: GroupFeedScanState, page: GroupFeedPage): void {
    if (!page.more) return;
    if (page.submissions.length === 0)
      throw new RangeError("group_feed_empty_nonterminal_page");
    if (page.nextCursor === null || page.nextCursor.trim().length === 0)
      throw new RangeError("group_feed_missing_next_cursor");
    if (page.nextCursor === state.paginationCursor)
      throw new RangeError("group_feed_repeated_cursor");
  }

  private ensureDescendingSubmissions(page: GroupFeedPage): void {
    let previous: bigint | undefined;
    for (const submission of page.submissions) {
      const current = BigInt(submission.submissionId);
      if (previous !== undefined && current >= previous)
        throw new RangeError("group_feed_non_descending_submission_ids");
      previous = current;
    }
  }
}
