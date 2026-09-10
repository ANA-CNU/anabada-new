import { GroupFeedCursorError } from "../group-feed-error.js";
import { GroupFeedRepository } from "../mysql/group-feed.js";
import type { AccountUnitOfWork } from "../mysql/unit-of-work.js";
import type { GroupScanResult } from "./group-cycle.js";
import {
  type GroupFeedPage,
  GroupFeedScanPolicy,
} from "./group-feed-scan-policy.js";
import type { GroupRuntimeFeedPort } from "./group-runtime.js";

export type GroupWindowScannerDependencies = {
  readonly accountUnitOfWork: AccountUnitOfWork;
  readonly groupId: string;
  readonly feed: GroupRuntimeFeedPort;
};

/** 고정 window를 유지하며 page inbox와 checkpoint advance를 각각 원자적으로 확정한다. */
export class GroupWindowScanner {
  private readonly policy = new GroupFeedScanPolicy();

  constructor(private readonly dependencies: GroupWindowScannerDependencies) {}

  async advance(
    signal: AbortSignal,
    maxPages: number,
  ): Promise<GroupScanResult> {
    if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10)
      throw new RangeError("invalid_group_page_limit");
    let acceptedCount = 0;
    let scannedPageCount = 0;
    for (let requestCount = 0; requestCount < maxPages; requestCount += 1) {
      signal.throwIfAborted();
      const checkpoint = await this.transaction((repository) =>
        repository.lockCheckpoint(this.dependencies.groupId),
      );
      if (!checkpoint || checkpoint.phase === "settling")
        return this.result(
          "settling",
          "complete",
          acceptedCount,
          scannedPageCount,
        );
      let page: GroupFeedPage;
      try {
        page = await this.dependencies.feed.readPage(
          checkpoint.paginationCursor,
          signal,
        );
      } catch (error) {
        if (!(error instanceof GroupFeedCursorError)) throw error;
        await this.transaction((repository) =>
          repository.resetPagination(this.dependencies.groupId),
        );
        continue;
      }
      const upper = GroupFeedScanPolicy.freezeUpper(
        checkpoint.committedCursor,
        checkpoint.upperSubmissionId,
        page,
      );
      const lower = checkpoint.windowLowerCursor ?? checkpoint.committedCursor;
      const first = page.submissions[0];
      if (
        first &&
        checkpoint.lastScannedSubmissionId !== null &&
        BigInt(first.submissionId) >= BigInt(checkpoint.lastScannedSubmissionId)
      )
        throw new RangeError("group_feed_non_descending_across_pages");
      const decision = this.policy.decide(
        {
          upperInclusiveSubmissionId: upper,
          lowerCursor: lower,
          paginationCursor: checkpoint.paginationCursor,
          overlapObservedCount: checkpoint.overlapObservedCount,
        },
        page,
      );
      const last = page.submissions.at(-1);
      await this.transaction(async (repository) => {
        await repository.appendInbox(
          this.dependencies.groupId,
          decision.accepted,
        );
        await repository.advanceCollection({
          groupId: this.dependencies.groupId,
          upperSubmissionId: upper,
          lowerCursor: lower,
          paginationCursor: decision.nextCursor,
          lastScannedSubmissionId:
            last?.submissionId ?? checkpoint.lastScannedSubmissionId,
          overlapObservedCount: decision.overlapObservedCount,
          cursorReached: decision.cursorReached,
        });
      });
      acceptedCount += decision.accepted.length;
      scannedPageCount += 1;
      if (decision.cursorReached)
        return this.result(
          "settling",
          "complete",
          acceptedCount,
          scannedPageCount,
        );
    }
    return this.result(
      "collecting",
      "pending",
      acceptedCount,
      scannedPageCount,
    );
  }

  private result(
    phase: "collecting" | "settling",
    status: "complete" | "pending",
    acceptedCount: number,
    scannedPageCount: number,
  ): GroupScanResult {
    return { phase, status, acceptedCount, scannedPageCount };
  }

  private transaction<T>(
    operation: (repository: GroupFeedRepository) => Promise<T>,
  ): Promise<T> {
    return this.dependencies.accountUnitOfWork.executeConnection((connection) =>
      operation(new GroupFeedRepository(connection)),
    );
  }
}
