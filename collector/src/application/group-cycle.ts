import type { RankMemberSnapshot } from "../domain/sync.js";
import type { SafeJungolDiagnostics } from "../jungol/errors.js";
import {
  type AccountFlowStep,
  type FlowTrace,
  GroupCycleFlowLog,
  type GroupCycleFlowStep,
} from "./flow-log.js";

export type GroupScanResult = {
  readonly phase: "collecting" | "settling";
  readonly status: "complete" | "pending";
  readonly acceptedCount: number;
  readonly scannedPageCount: number;
};

export type GroupSettlementResult = {
  readonly settledUserCount: number;
  readonly failedUserCount: number;
  readonly failures: readonly GroupSettlementFailure[];
  readonly insertedAttemptCount: number;
  readonly duplicateAttemptCount: number;
  readonly inboxEmpty: boolean;
};

export type GroupAccountFailure = {
  readonly accountId: string;
  readonly code: string;
  readonly trace?: FlowTrace<AccountFlowStep> | undefined;
  readonly diagnostics?: SafeJungolDiagnostics | undefined;
};

export type GroupInitializationFailure = GroupAccountFailure;
export type GroupSettlementFailure = GroupAccountFailure;

export interface GroupCycleAdapters {
  phase(signal: AbortSignal): Promise<"collecting" | "settling">;
  members(signal: AbortSignal): Promise<readonly RankMemberSnapshot[]>;
  checkpointInitialHead(signal: AbortSignal): Promise<void>;
  initializeMembers(
    members: readonly RankMemberSnapshot[],
    signal: AbortSignal,
  ): Promise<readonly GroupInitializationFailure[]>;
  advanceWindow(
    signal: AbortSignal,
    maxPages: number,
  ): Promise<GroupScanResult>;
  settle(signal: AbortSignal): Promise<GroupSettlementResult>;
  finalize(signal: AbortSignal): Promise<"finalized" | "pending">;
  rebuildMonthlyCache(signal: AbortSignal): Promise<void>;
  project(signal: AbortSignal): Promise<void>;
}

export type GroupCycleResult = {
  readonly status: GroupCycleStatus;
  readonly memberCount: number;
  readonly initializationFailureCount: number;
  readonly initializationFailures: readonly GroupInitializationFailure[];
  readonly settlementFailureCount: number;
  readonly scan: GroupScanResult;
  readonly settlement: GroupSettlementResult;
  readonly finalized: boolean;
  readonly trace: FlowTrace<GroupCycleFlowStep> | undefined;
};

export type GroupCycleStatus = "success" | "success_pending" | "partial";

export class GroupCycleFailure extends Error {
  readonly name = "GroupCycleFailure";

  constructor(
    readonly cause: unknown,
    readonly trace: FlowTrace<GroupCycleFlowStep>,
  ) {
    super("group_cycle_failed");
  }
}

export class GroupCycleExecutor {
  private flow: GroupCycleFlowLog | undefined;

  constructor(private readonly adapters: GroupCycleAdapters) {}

  currentStage(): GroupCycleFlowStep | undefined {
    return this.flow?.currentStep();
  }

  async run(signal: AbortSignal): Promise<GroupCycleResult> {
    signal.throwIfAborted();
    const trace = new GroupCycleFlowLog();
    this.flow = trace;
    try {
      const phase = await trace.runStep("group_phase", () =>
        this.adapters.phase(signal),
      );
      const members = await trace.runStep("group_members", () =>
        this.adapters.members(signal),
      );
      await trace.runStep("group_checkpoint", () =>
        this.adapters.checkpointInitialHead(signal),
      );
      // settling inbox에 새 계정이 남아도 기준선 재시도를 건너뛰면 영구 미정산된다.
      const failures = await trace.runStep("group_initialize", () =>
        this.adapters.initializeMembers(members, signal),
      );
      const scan: GroupScanResult =
        phase === "collecting"
          ? await trace.runStep("group_scan", () =>
              this.adapters.advanceWindow(signal, 10),
            )
          : {
              phase: "settling",
              status: "complete",
              acceptedCount: 0,
              scannedPageCount: 0,
            };
      const settlement =
        scan.status === "complete"
          ? await trace.runStep("group_settlement", () =>
              this.adapters.settle(signal),
            )
          : {
              settledUserCount: 0,
              failedUserCount: 0,
              failures: [],
              insertedAttemptCount: 0,
              duplicateAttemptCount: 0,
              inboxEmpty: false,
            };
      const finalization =
        scan.status === "complete" && settlement.inboxEmpty
          ? await trace.runStep("group_finalize", () =>
              this.adapters.finalize(signal),
            )
          : "pending";
      await trace.runStep("monthly_cache", () =>
        this.adapters.rebuildMonthlyCache(signal),
      );
      await trace.runStep("projection", () => this.adapters.project(signal));
      const isPending =
        scan.status === "pending" ||
        !settlement.inboxEmpty ||
        finalization === "pending";
      return {
        status:
          failures.length > 0 || settlement.failedUserCount > 0
            ? "partial"
            : isPending
              ? "success_pending"
              : "success",
        memberCount: members.length,
        initializationFailureCount: failures.length,
        initializationFailures: failures,
        settlementFailureCount: settlement.failedUserCount,
        scan,
        settlement,
        finalized: finalization === "finalized",
        trace: undefined,
      };
    } catch (error) {
      const snapshot = trace.failureSnapshot();
      if (snapshot) throw new GroupCycleFailure(error, snapshot);
      throw error;
    } finally {
      trace.dispose();
      this.flow = undefined;
    }
  }
}
