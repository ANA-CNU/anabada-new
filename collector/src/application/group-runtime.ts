import type { AccountInitializationService } from "../account-initialization.js";
import type {
  GroupMemberSnapshot,
  InitialSolvedProblem,
} from "../domain/sync.js";
import { AccountInitialSnapshot, AccountSyncPlan } from "../domain/sync.js";
import { ProblemTierEstimator } from "../group-domain.js";
import { JungolError } from "../jungol/errors.js";
import { MonthlyScoreCacheService } from "../monthly-score-cache.js";
import { GroupFeedRepository } from "../mysql/group-feed.js";
import type { AccountUnitOfWork } from "../mysql/unit-of-work.js";
import type { ProjectionResult } from "../projection.js";
import type { KstCalendar } from "../scoring/daily.js";
import { AtomicCycleFailure } from "./cycle-atomic-error.js";
import { type CycleCommitResult, CycleCommitService } from "./cycle-commit.js";
import { CycleTrace } from "./cycle-diagnostics.js";
import { CyclePreparationService } from "./cycle-preparation.js";
import { AccountFlowLog } from "./flow-log.js";
import type {
  GroupCycleAdapters,
  GroupInitializationFailure,
  GroupSettlementResult,
} from "./group-cycle.js";
import { GroupRuntimeErrorPolicy } from "./group-runtime-error.js";
import {
  GroupSettlementRuntime,
  type GroupSettlementRuntimeDependencies,
} from "./group-runtime-settlement.js";
import { GroupWindowScanner } from "./group-window-scanner.js";

export { GroupFeedCursorError } from "../group-feed-error.js";

export type GroupInitializationProfile = {
  readonly member: GroupMemberSnapshot;
  readonly solved: readonly InitialSolvedProblem[];
  readonly highestInspectedSubmissionId: bigint;
};

export interface GroupRuntimeFeedPort {
  head(signal: AbortSignal): Promise<bigint>;
  readPage(
    cursor: GroupFeedResumePosition,
    signal: AbortSignal,
  ): Promise<import("./group-feed-scan-policy.js").GroupFeedPage>;
}

export type GroupFeedResumePosition = {
  readonly lastScannedSubmissionId: string | null;
};

export interface GroupRuntimeProfilePort {
  /** profile은 신규 계정의 historical solved-list 기준선에만 사용한다. */
  initialize(
    member: GroupMemberSnapshot,
    signal: AbortSignal,
  ): Promise<GroupInitializationProfile>;
  /** 정산 시점 member는 profile 요청이 아니라 cycle의 그룹 메인 snapshot에서 찾는다. */
  currentMember(
    accountId: GroupMemberSnapshot["accountId"],
    signal: AbortSignal,
  ): Promise<GroupMemberSnapshot>;
}

export type GroupRuntimeDependencies = GroupSettlementRuntimeDependencies & {
  readonly groupId: string;
  readonly accountUnitOfWork: AccountUnitOfWork;
  readonly initialization: AccountInitializationService;
  readonly calendar: KstCalendar;
  readonly feed: GroupRuntimeFeedPort;
  readonly members: (
    signal: AbortSignal,
  ) => Promise<readonly GroupMemberSnapshot[]>;
  readonly profiles: GroupRuntimeProfilePort;
  readonly project: (signal: AbortSignal) => Promise<void>;
  readonly projectOnConnection?: (
    connection: import("mysql2/promise").PoolConnection,
    now: Date,
  ) => Promise<ProjectionResult>;
  readonly notifyProjection?: (
    result: ProjectionResult,
    signal: AbortSignal,
  ) => Promise<void>;
  readonly warn?: (code: string) => void;
  readonly cycleTrace?: CycleTrace;
  readonly now?: () => Date;
};

/** 브라우저 포트는 transaction 밖에서 읽고 cycle 순서만 GroupCycleExecutor에 위임한다. */
export class GroupRuntime implements GroupCycleAdapters {
  private readonly now: () => Date;
  private readonly settlement: GroupSettlementRuntime;
  private readonly scanner: GroupWindowScanner;
  private readonly errors = new GroupRuntimeErrorPolicy();

  constructor(private readonly dependencies: GroupRuntimeDependencies) {
    if (dependencies.groupId !== "1125")
      throw new RangeError("unsupported_group_id");
    this.now = dependencies.now ?? (() => new Date());
    this.settlement = new GroupSettlementRuntime(dependencies, (operation) =>
      dependencies.accountUnitOfWork.executeConnection(operation),
    );
    this.scanner = new GroupWindowScanner(dependencies);
  }

  async phase(_signal: AbortSignal): Promise<"collecting" | "settling"> {
    const checkpoint =
      await this.dependencies.accountUnitOfWork.executeConnection(
        (connection) =>
          new GroupFeedRepository(connection).lockCheckpoint(
            this.dependencies.groupId,
          ),
      );
    return checkpoint?.phase === "settling" ? "settling" : "collecting";
  }

  async runAtomic(
    signal: AbortSignal,
  ): Promise<import("./group-cycle.js").GroupCycleResult> {
    if (!this.dependencies.projectOnConnection)
      throw new RangeError("missing_atomic_projection");
    const trace = this.dependencies.cycleTrace ?? new CycleTrace("local-cycle");
    try {
      return await this.runAtomicTraced(signal, trace);
    } catch (error) {
      throw new AtomicCycleFailure(error, trace.snapshot());
    }
  }

  private async runAtomicTraced(
    signal: AbortSignal,
    trace: CycleTrace,
  ): Promise<import("./group-cycle.js").GroupCycleResult> {
    const preparation = new CyclePreparationService(
      this.dependencies,
      this.dependencies.tierEstimator ?? new ProblemTierEstimator(),
      this.now,
      trace,
    );
    const prepared = await trace.run("prepare", {}, () =>
      preparation.prepare(signal),
    );
    const commit = new CycleCommitService({
      groupId: this.dependencies.groupId,
      unitOfWork: this.dependencies.accountUnitOfWork,
      initialization: this.dependencies.initialization,
      settlement: this.dependencies.settlement,
      calendar: this.dependencies.calendar,
      ...(this.dependencies.projectOnConnection
        ? { projectOnConnection: this.dependencies.projectOnConnection }
        : {}),
    });
    let committed: CycleCommitResult;
    committed = await trace.run("commit", {}, () =>
      commit.commit(prepared, signal, undefined, trace, undefined),
    );
    const notifyProjection = this.dependencies.notifyProjection;
    if (committed.projection && notifyProjection)
      try {
        await trace.run("projection_notify", {}, () =>
          notifyProjection(committed.projection as ProjectionResult, signal),
        );
      } catch (error) {
        trace.fail("projection_notify", error, { code: "notification_failed" });
        this.dependencies.warn?.("projection_notification_failed");
      }
    return {
      status: committed.pending ? "success_pending" : "success",
      memberCount: prepared.members.length,
      initializationFailureCount: 0,
      initializationFailures: [],
      settlementFailureCount: 0,
      scan: {
        phase: committed.pending ? "collecting" : "settling",
        status: committed.pending ? "pending" : "complete",
        acceptedCount: committed.acceptedCount,
        scannedPageCount: committed.scannedPageCount,
      },
      settlement: {
        settledUserCount: committed.settledUserCount,
        failedUserCount: 0,
        failures: [],
        insertedAttemptCount: committed.insertedAttemptCount,
        duplicateAttemptCount: committed.duplicateAttemptCount,
        settlementOutcomes: committed.settlementOutcomes,
        initializedAccountCount: committed.initializedAccountCount,
        initializedSolvedCount: committed.initializedSolvedCount,
        inboxEmpty: committed.inboxEmpty,
      },
      finalized: committed.finalized,
      trace: undefined,
      cycleTrace: trace.snapshot(),
    };
  }

  async members(signal: AbortSignal): Promise<readonly GroupMemberSnapshot[]> {
    return this.dependencies.members(signal);
  }

  async checkpointInitialHead(signal: AbortSignal): Promise<void> {
    const missing = await this.dependencies.accountUnitOfWork.executeConnection(
      (connection) =>
        new GroupFeedRepository(connection).lockCheckpoint(
          this.dependencies.groupId,
        ),
    );
    if (missing) return;
    const head = await this.dependencies.feed.head(signal);
    if (head < 0n) throw new RangeError("invalid_group_feed_head");
    await this.dependencies.accountUnitOfWork.executeConnection(
      async (connection) => {
        const repository = new GroupFeedRepository(connection);
        if (await repository.lockCheckpoint(this.dependencies.groupId)) return;
        await repository.insertCheckpoint(
          this.dependencies.groupId,
          head.toString(),
        );
      },
    );
  }

  async initializeMembers(
    members: readonly GroupMemberSnapshot[],
    signal: AbortSignal,
  ): Promise<readonly GroupInitializationFailure[]> {
    const failures: GroupInitializationFailure[] = [];
    for (const member of members) {
      const trace = new AccountFlowLog();
      try {
        signal.throwIfAborted();
        const state = await trace.runStep("refresh_state", () =>
          this.dependencies.accountUnitOfWork.execute((repositories) =>
            repositories.users.registerAndReadInitialization(member),
          ),
        );
        if (state.initialized) continue;
        const profile = await trace.runStep("initial_summary", () =>
          this.dependencies.profiles.initialize(member, signal),
        );
        await trace.runStep("prepare_snapshot", async () => {
          if (profile.member.accountId !== member.accountId)
            throw new RangeError("group_profile_account_mismatch");
        });
        await trace.runStep("initialize_transaction", () =>
          this.dependencies.initialization.initialize(
            new AccountInitialSnapshot(
              new AccountSyncPlan("initial_summary", profile.member, 0n, 0, 1),
              profile.solved,
              profile.highestInspectedSubmissionId,
            ),
          ),
        );
      } catch (error) {
        if (signal.aborted) throw error;
        if (this.errors.isCircuit(error)) throw error;
        failures.push({
          accountId: member.accountId,
          code: this.errors.code(error),
          trace: trace.failureSnapshot(),
          diagnostics:
            error instanceof JungolError ? error.diagnostics : undefined,
        });
      } finally {
        trace.dispose();
      }
    }
    return failures;
  }

  advanceWindow(signal: AbortSignal, maxPages: number) {
    return this.scanner.advance(signal, maxPages);
  }

  async settle(signal: AbortSignal): Promise<GroupSettlementResult> {
    return this.settlement.settle(signal);
  }

  async finalize(_signal: AbortSignal): Promise<"finalized" | "pending"> {
    return (await this.dependencies.accountUnitOfWork.executeConnection(
      (connection) =>
        new GroupFeedRepository(connection).finalizeWhenInboxEmpty(
          this.dependencies.groupId,
        ),
    ))
      ? "finalized"
      : "pending";
  }

  async rebuildMonthlyCache(_signal: AbortSignal): Promise<void> {
    await this.dependencies.accountUnitOfWork.executeConnection((connection) =>
      new MonthlyScoreCacheService(
        connection,
        this.dependencies.calendar,
      ).rebuildStale(this.now()),
    );
  }

  project(signal: AbortSignal): Promise<void> {
    return this.dependencies.project(signal);
  }
}
