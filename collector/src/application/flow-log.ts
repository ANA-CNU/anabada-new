import { BoundaryError } from "../errors.js";
import { JungolError } from "../jungol/errors.js";
import { PersistenceError } from "../mysql/account-types.js";

export type FlowOutcome = "started" | "completed" | "failed";
export type FlowErrorKind = "type_error" | "range_error" | "internal_error";
export type FlowEvent<Step extends string> = {
  readonly sequence: number;
  readonly elapsedMs: number;
  readonly step: Step;
  readonly outcome: FlowOutcome;
  readonly errorKind?: FlowErrorKind | undefined;
};
export type FlowTrace<Step extends string> = {
  readonly events: readonly FlowEvent<Step>[];
  readonly droppedEventCount: number;
  readonly primaryFailure?: FlowEvent<Step> | undefined;
};

/**
 * 흐름별 인스턴스만 보관하는 32개 이벤트 순환 버퍼다. 원문 예외·객체는 넣지 않아
 * 실패 알림 경계에서 계정 간 상태와 비밀이 섞이지 않는다.
 */
export abstract class FlowLog<Step extends string> {
  private readonly events: FlowEvent<Step>[] = [];
  private readonly startedAt: number;
  private sequence = 0;
  private droppedEventCount = 0;
  private failed = false;
  private primaryFailure: FlowEvent<Step> | undefined;

  protected constructor(
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.startedAt = clock();
  }

  async runStep<Value>(
    step: Step,
    operation: () => Promise<Value>,
  ): Promise<Value> {
    this.record(step, "started");
    try {
      const value = await operation();
      this.record(step, "completed");
      return value;
    } catch (error) {
      this.failed = true;
      const failed = this.record(step, "failed", this.errorKind(error));
      this.primaryFailure ??= failed;
      throw error;
    }
  }

  failureSnapshot(): FlowTrace<Step> | undefined {
    if (!this.failed) return undefined;
    return {
      events: this.events.map((event) => ({ ...event })),
      droppedEventCount: this.droppedEventCount,
      primaryFailure: this.primaryFailure
        ? { ...this.primaryFailure }
        : undefined,
    };
  }

  dispose(): void {
    this.events.length = 0;
    this.droppedEventCount = 0;
    this.failed = false;
    this.primaryFailure = undefined;
  }

  markRecovered(): void {
    this.failed = false;
    this.primaryFailure = undefined;
  }

  private record(
    step: Step,
    outcome: FlowOutcome,
    errorKind?: FlowErrorKind,
  ): FlowEvent<Step> {
    if (this.events.length === 32) {
      this.events.shift();
      this.droppedEventCount += 1;
    }
    const event = {
      sequence: ++this.sequence,
      elapsedMs: Math.max(0, this.clock() - this.startedAt),
      step,
      outcome,
      errorKind,
    };
    this.events.push(event);
    return event;
  }

  private errorKind(error: unknown): FlowErrorKind | undefined {
    if (error instanceof TypeError) return "type_error";
    if (error instanceof RangeError) return "range_error";
    if (
      error instanceof BoundaryError ||
      error instanceof JungolError ||
      error instanceof PersistenceError
    )
      return undefined;
    return error instanceof Error ? "internal_error" : undefined;
  }
}

export type AccountFlowStep =
  | "browser_open"
  | "initial_cursor"
  | "initial_summary"
  | "prepare_snapshot"
  | "prepare_attempts"
  | "browser_close"
  | "initialize_transaction"
  | "incremental_collect"
  | "metadata"
  | "db_persist"
  | "rank_refresh"
  | "refresh_state"
  | "metadata_refresh";
export class AccountFlowLog extends FlowLog<AccountFlowStep> {
  constructor(clock: () => number = () => performance.now()) {
    super(clock);
  }
}
export class AccountFlowFailure extends Error {
  constructor(
    readonly cause: unknown,
    readonly trace: FlowTrace<AccountFlowStep>,
  ) {
    super("account_flow_failed");
  }
}

export type CycleFlowStep =
  | "lease"
  | "login"
  | "rank"
  | "stored"
  | "planner"
  | "worker_completion"
  | "projection"
  | "release";
export class CycleFlowLog extends FlowLog<CycleFlowStep> {
  constructor(clock: () => number = () => performance.now()) {
    super(clock);
  }
}

export type GroupCycleFlowStep =
  | "group_phase"
  | "group_members"
  | "group_checkpoint"
  | "group_initialize"
  | "group_scan"
  | "group_settlement"
  | "group_finalize"
  | "monthly_cache"
  | "projection";
export class GroupCycleFlowLog extends FlowLog<GroupCycleFlowStep> {
  constructor(clock: () => number = () => performance.now()) {
    super(clock);
  }
}
