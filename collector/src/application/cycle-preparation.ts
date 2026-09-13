import {
  AcceptedAttempt,
  AccountInitialSnapshot,
  AccountSyncPlan,
  isKnownProblemTier,
  type RankMemberSnapshot,
} from "../domain/sync.js";
import type { ProblemId } from "../domain.js";
import type { ProblemTierEstimator } from "../group-domain.js";
import { GroupFeedCursorError } from "../group-feed-error.js";
import type { ProblemMetadata } from "../jungol/metadata.js";
import { PersistenceError } from "../mysql/account-types.js";
import {
  type CollectorCheckpoint,
  GroupFeedRepository,
  type SettlementInboxRow,
} from "../mysql/group-feed.js";
import { type PreparedUserState, UserRepository } from "../mysql/users.js";
import type { CycleTrace } from "./cycle-diagnostics.js";
import {
  type GroupFeedPage,
  GroupFeedScanPolicy,
} from "./group-feed-scan-policy.js";
import type { GroupRuntimeDependencies } from "./group-runtime.js";

export type PreparedInitialization = {
  readonly snapshot: AccountInitialSnapshot;
};

export type PreparedSettlement = {
  readonly member: RankMemberSnapshot;
  readonly attempts: readonly AcceptedAttempt[];
  readonly highestSubmissionId: bigint;
};

export type PreparedCollection = {
  readonly checkpoint: CollectorCheckpoint | null;
  readonly head: bigint | null;
  readonly accepted: readonly import("../group-domain.js").GroupAcceptedSubmission[];
  readonly scannedPageCount: number;
  readonly phase: "collecting" | "settling";
  readonly complete: boolean;
  readonly next: {
    readonly upperSubmissionId: string;
    readonly lowerCursor: string;
    readonly paginationCursor: string | null;
    readonly lastScannedSubmissionId: string | null;
    readonly overlapObservedCount: number;
    readonly cursorReached: boolean;
  } | null;
};

type PreparedCollectionAdvance = NonNullable<PreparedCollection["next"]> & {
  readonly accepted: readonly import("../group-domain.js").GroupAcceptedSubmission[];
};

/** Browser/metadata와 DB read snapshot만 담고 write transaction 전에 완결되는 불변 cycle 입력이다. */
export type PreparedCycle = {
  readonly members: readonly RankMemberSnapshot[];
  readonly collection: PreparedCollection;
  readonly initializations: readonly PreparedInitialization[];
  readonly settlements: readonly PreparedSettlement[];
  readonly userStates: readonly (PreparedUserState | null)[];
  readonly inboxSnapshot: readonly SettlementInboxRow[];
  readonly preparedAt: Date;
};

/** 외부 I/O와 bounded DB reads를 모두 transaction 밖에서 끝낸다. */
export class CyclePreparationService {
  private readonly policy = new GroupFeedScanPolicy();
  private readonly metadata = new Map<ProblemId, ProblemMetadata>();
  private readonly estimates = new Map<ProblemId, number>();

  constructor(
    private readonly dependencies: GroupRuntimeDependencies,
    private readonly tierEstimator: Pick<ProblemTierEstimator, "estimate_tier">,
    private readonly now: () => Date,
    private readonly trace?: CycleTrace,
  ) {}

  async prepare(signal: AbortSignal): Promise<PreparedCycle> {
    signal.throwIfAborted();
    this.metadata.clear();
    this.estimates.clear();
    try {
      const [checkpoint, members] = await Promise.all([
        this.dependencies.accountUnitOfWork.readConnection((connection) =>
          new GroupFeedRepository(connection).readCheckpoint(
            this.dependencies.groupId,
          ),
        ),
        this.dependencies.members(signal),
      ]);
      this.trace?.progressUpdate({ memberCount: members.length });
      this.trace?.stage("prepare_members", { memberCount: members.length });
      const initializationStates =
        await this.dependencies.accountUnitOfWork.readConnection((connection) =>
          new UserRepository(connection).readInitializationStates(
            members.map((member) => member.accountId),
          ),
        );
      const initialCollection = !checkpoint
        ? await this.collect(checkpoint, signal)
        : null;
      const initializations = await this.prepareInitializations(
        members,
        initializationStates,
        signal,
      );
      const collection =
        initialCollection ?? (await this.collect(checkpoint, signal));
      this.trace?.progressUpdate({
        scannedPageCount: collection.scannedPageCount,
      });
      const inboxSnapshot = collection.complete
        ? await this.dependencies.accountUnitOfWork.readConnection(
            (connection) =>
              new GroupFeedRepository(connection).readInboxSnapshot(
                this.dependencies.groupId,
              ),
          )
        : [];
      const settlements = collection.complete
        ? await this.prepareSettlements(
            members,
            this.combineInbox(inboxSnapshot, collection.accepted),
            signal,
          )
        : [];
      this.trace?.progressUpdate({ settlementUserCount: settlements.length });
      return Object.freeze({
        members: Object.freeze([...members]),
        collection: Object.freeze(collection),
        initializations: Object.freeze(initializations),
        settlements: Object.freeze(settlements),
        userStates: Object.freeze(
          members.map(
            (member) => initializationStates.get(member.accountId) ?? null,
          ),
        ),
        inboxSnapshot: Object.freeze([...inboxSnapshot]),
        preparedAt: this.now(),
      });
    } finally {
      this.metadata.clear();
      this.estimates.clear();
    }
  }

  private async collect(
    checkpoint: CollectorCheckpoint | null,
    signal: AbortSignal,
  ): Promise<PreparedCollection> {
    if (!checkpoint) {
      const head = await this.dependencies.feed.head(signal);
      if (head < 0n) throw new RangeError("invalid_group_feed_head");
      return {
        checkpoint: null,
        head,
        accepted: [],
        scannedPageCount: 0,
        phase: "collecting",
        complete: false,
        next: null,
      };
    }
    if (checkpoint.phase === "settling")
      return {
        checkpoint,
        head: null,
        accepted: [],
        scannedPageCount: 0,
        phase: "settling",
        complete: true,
        next: null,
      };
    let state = checkpoint;
    let lastNext: PreparedCollectionAdvance | null = null;
    const accepted: import("../group-domain.js").GroupAcceptedSubmission[] = [];
    let scannedAttemptCount = 0;
    for (let count = 0; count < 10; count += 1) {
      signal.throwIfAborted();
      let page: GroupFeedPage;
      try {
        page = await this.dependencies.feed.readPage(
          state.paginationCursor,
          signal,
        );
      } catch (error) {
        if (!(error instanceof GroupFeedCursorError)) throw error;
        state = {
          ...state,
          paginationCursor: null,
          lastScannedSubmissionId: null,
          overlapObservedCount: 0,
        };
        continue;
      }
      scannedAttemptCount += page.submissions.length;
      this.trace?.progressUpdate({
        scannedPageCount: count + 1,
        scannedAttemptCount,
      });
      const next = this.nextCollection(state, page);
      lastNext = next;
      accepted.push(...next.accepted);
      this.trace?.progressUpdate({ acceptedCount: accepted.length });
      if (next.cursorReached)
        return {
          checkpoint,
          head: null,
          accepted,
          scannedPageCount: count + 1,
          phase: "settling",
          complete: true,
          next,
        };
      state = {
        ...state,
        upperSubmissionId: next.upperSubmissionId,
        windowLowerCursor: next.lowerCursor,
        paginationCursor: next.paginationCursor,
        lastScannedSubmissionId: next.lastScannedSubmissionId,
        overlapObservedCount: next.overlapObservedCount,
        cursorReached: false,
      };
    }
    if (!lastNext)
      throw new RangeError("group_feed_no_page_after_cursor_reset");
    return {
      checkpoint,
      head: null,
      accepted,
      scannedPageCount: 10,
      phase: "collecting",
      complete: false,
      next: lastNext,
    };
  }

  private nextCollection(
    checkpoint: CollectorCheckpoint,
    page: GroupFeedPage,
  ): PreparedCollectionAdvance {
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
    return {
      accepted: decision.accepted,
      upperSubmissionId: upper,
      lowerCursor: lower,
      paginationCursor: decision.nextCursor,
      lastScannedSubmissionId:
        page.submissions.at(-1)?.submissionId ??
        checkpoint.lastScannedSubmissionId,
      overlapObservedCount: decision.overlapObservedCount,
      cursorReached: decision.cursorReached,
    };
  }

  private async prepareInitializations(
    members: readonly RankMemberSnapshot[],
    states: ReadonlyMap<string, PreparedUserState>,
    signal: AbortSignal,
  ): Promise<readonly PreparedInitialization[]> {
    const prepared: PreparedInitialization[] = [];
    for (const member of members) {
      const state = states.get(member.accountId);
      if (
        state &&
        state.initializedAt !== null &&
        state.initialSubmissionId !== null
      )
        continue;
      const profile = this.trace
        ? await this.trace.run(
            "user_profile",
            { accountId: member.accountId },
            () => this.dependencies.profiles.initialize(member, signal),
          )
        : await this.dependencies.profiles.initialize(member, signal);
      if (profile.member.accountId !== member.accountId)
        throw new RangeError("group_profile_account_mismatch");
      prepared.push({
        snapshot: new AccountInitialSnapshot(
          new AccountSyncPlan("initial_summary", profile.member, 0n, 0, 1),
          profile.solved,
          profile.highestInspectedSubmissionId,
        ),
      });
    }
    return prepared;
  }

  private combineInbox(
    inbox: readonly SettlementInboxRow[],
    accepted: readonly import("../group-domain.js").GroupAcceptedSubmission[],
  ): readonly SettlementInboxRow[] {
    const rows = [
      ...inbox,
      ...accepted.map((row) => ({
        externalSubmissionId: row.submissionId,
        accountId: row.accountId,
        problemId: row.problemId,
        submittedAt: row.submittedAt,
        score: row.score,
      })),
    ].map((row) => ({
      externalSubmissionId: row.externalSubmissionId,
      accountId: row.accountId,
      problemId: row.problemId,
      submittedAt: row.submittedAt,
      score: row.score,
    }));
    const unique = new Map<string, SettlementInboxRow>();
    for (const row of rows) {
      const existing = unique.get(row.externalSubmissionId.toString());
      if (
        existing &&
        (existing.accountId !== row.accountId ||
          existing.problemId !== row.problemId)
      )
        throw new PersistenceError("submission_conflict");
      unique.set(row.externalSubmissionId.toString(), row);
    }
    return [...unique.values()];
  }

  private async prepareSettlements(
    members: readonly RankMemberSnapshot[],
    rows: readonly SettlementInboxRow[],
    signal: AbortSignal,
  ): Promise<readonly PreparedSettlement[]> {
    const memberById = new Map<
      RankMemberSnapshot["accountId"],
      RankMemberSnapshot
    >(members.map((member) => [member.accountId, member]));
    const accounts = new Set<string>();
    const selected = [...rows]
      .sort(
        (left, right) =>
          left.submittedAt.getTime() - right.submittedAt.getTime() ||
          (BigInt(left.externalSubmissionId) <
          BigInt(right.externalSubmissionId)
            ? -1
            : 1),
      )
      .slice(0, 200)
      .filter((row) => {
        if (accounts.has(row.accountId)) return true;
        if (accounts.size === 10) return false;
        accounts.add(row.accountId);
        return true;
      });
    const grouped = new Map<
      RankMemberSnapshot["accountId"],
      SettlementInboxRow[]
    >();
    for (const row of selected)
      grouped.set(row.accountId, [...(grouped.get(row.accountId) ?? []), row]);
    const prepared: PreparedSettlement[] = [];
    for (const [accountId, accountRows] of grouped) {
      const member = memberById.get(accountId);
      if (!member) throw new RangeError("group_member_snapshot_missing");
      const attempts: AcceptedAttempt[] = [];
      for (const row of accountRows)
        attempts.push(await this.attemptFor(row, signal));
      prepared.push({
        member,
        attempts,
        highestSubmissionId: attempts.reduce(
          (highest, attempt) =>
            BigInt(attempt.submissionId) > highest
              ? BigInt(attempt.submissionId)
              : highest,
          0n,
        ),
      });
    }
    return prepared;
  }

  private async attemptFor(
    row: SettlementInboxRow,
    signal: AbortSignal,
  ): Promise<AcceptedAttempt> {
    const metadata = await this.metadataFor(row.problemId, signal);
    const tier = isKnownProblemTier(metadata.tier) ? metadata.tier : 0;
    const estimatedTier = tier === 0 ? await this.estimate(row.problemId) : 0;
    return new AcceptedAttempt(
      row.externalSubmissionId,
      row.problemId,
      metadata.title,
      tier,
      row.submittedAt,
      row.score,
      estimatedTier,
    );
  }

  private async metadataFor(problemId: ProblemId, signal: AbortSignal) {
    const cached = this.metadata.get(problemId);
    if (cached) return cached;
    const metadata = await this.dependencies.metadata.read(problemId, signal);
    this.metadata.set(problemId, metadata);
    return metadata;
  }

  private async estimate(problemId: ProblemId): Promise<number> {
    const cached = this.estimates.get(problemId);
    if (cached !== undefined) return cached;
    const tier = await this.tierEstimator.estimate_tier(problemId);
    this.estimates.set(problemId, tier);
    return tier;
  }
}
