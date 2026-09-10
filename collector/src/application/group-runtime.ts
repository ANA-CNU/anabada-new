import type { AccountInitializationService } from "../account-initialization.js";
import type {
  InitialSolvedProblem,
  RankMemberSnapshot,
} from "../domain/sync.js";
import { AccountInitialSnapshot, AccountSyncPlan } from "../domain/sync.js";
import { JungolError } from "../jungol/errors.js";
import { MonthlyScoreCacheService } from "../monthly-score-cache.js";
import { GroupFeedRepository } from "../mysql/group-feed.js";
import type { AccountUnitOfWork } from "../mysql/unit-of-work.js";
import type { KstCalendar } from "../scoring/daily.js";
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
  readonly member: RankMemberSnapshot;
  readonly solved: readonly InitialSolvedProblem[];
  readonly highestInspectedSubmissionId: bigint;
};

export interface GroupRuntimeFeedPort {
  head(signal: AbortSignal): Promise<bigint>;
  readPage(
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<import("./group-feed-scan-policy.js").GroupFeedPage>;
}

export interface GroupRuntimeProfilePort {
  /** profile은 신규 계정의 historical solved-list 기준선에만 사용한다. */
  initialize(
    member: RankMemberSnapshot,
    signal: AbortSignal,
  ): Promise<GroupInitializationProfile>;
  /** 정산 시점 member는 profile 요청이 아니라 cycle의 그룹 rank snapshot에서 찾는다. */
  currentMember(
    accountId: RankMemberSnapshot["accountId"],
    signal: AbortSignal,
  ): Promise<RankMemberSnapshot>;
}

export type GroupRuntimeDependencies = GroupSettlementRuntimeDependencies & {
  readonly groupId: string;
  readonly accountUnitOfWork: AccountUnitOfWork;
  readonly initialization: AccountInitializationService;
  readonly calendar: KstCalendar;
  readonly feed: GroupRuntimeFeedPort;
  readonly members: (
    signal: AbortSignal,
  ) => Promise<readonly RankMemberSnapshot[]>;
  readonly profiles: GroupRuntimeProfilePort;
  readonly project: (signal: AbortSignal) => Promise<void>;
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

  async members(signal: AbortSignal): Promise<readonly RankMemberSnapshot[]> {
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
    members: readonly RankMemberSnapshot[],
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
