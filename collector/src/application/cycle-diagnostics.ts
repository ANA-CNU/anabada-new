import { JungolError } from "../jungol/errors.js";
import { BoundedTraceBuffer } from "./flow-log.js";

export const cycleTransactionStatuses = [
  "not_started",
  "active",
  "committed",
  "rolled_back",
  "rollback_failed",
  "commit_unknown",
] as const;

export type CycleTransactionStatus = (typeof cycleTransactionStatuses)[number];
export type SafeCycleContext = Readonly<
  Record<string, string | number | boolean | null>
>;
export type CycleTraceOutcome = "started" | "completed" | "failed";
export type CycleTraceEvent = {
  readonly sequence: number;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly stage: string;
  readonly outcome: CycleTraceOutcome;
  readonly context: SafeCycleContext;
};
export type CycleTraceSnapshot = {
  readonly cycleId: string;
  readonly durationMs: number;
  readonly transactionStatus: CycleTransactionStatus;
  readonly events: readonly CycleTraceEvent[];
  readonly droppedEventCount: number;
  readonly progress?: Readonly<{
    memberCount: number;
    scannedPageCount: number;
    scannedAttemptCount: number;
    acceptedCount: number;
    settlementUserCount: number;
  }>;
  readonly firstFailure?: CycleTraceEvent | undefined;
};
export type CycleTraceSpan = { readonly token: number };

const EVENT_LIMIT = 128;
const safeContextNames = new Set([
  "code",
  "count",
  "memberCount",
  "responseCount",
  "matchedCount",
  "httpStatus",
  "pageNumber",
  "timeoutMs",
  "queueWaitMs",
  "responseObserved",
  "cursorPresent",
  "sqlState",
  "errno",
  "operationId",
  "insertedCount",
  "duplicateCount",
  "errorKind",
  "accountId",
  "submissionId",
  "problemId",
  "endpointPath",
  "actorHandle",
  "imageObserved",
  "titleObserved",
]);

/** cycle 단위 안전 진단을 보관하며 원문 오류와 비밀을 trace 경계 밖으로 차단한다. */
export class CycleTrace {
  private readonly startedAt: number;
  private readonly events = new BoundedTraceBuffer<CycleTraceEvent>(
    EVENT_LIMIT,
  );
  private sequence = 0;
  private transactionStatus: CycleTransactionStatus = "not_started";
  private progress = {
    memberCount: 0,
    scannedPageCount: 0,
    scannedAttemptCount: 0,
    acceptedCount: 0,
    settlementUserCount: 0,
  };
  private firstFailure: CycleTraceEvent | undefined;
  private readonly openSpans = new Map<
    number,
    {
      readonly stage: string;
      readonly context: SafeCycleContext;
      readonly startedAt: number;
    }
  >();

  constructor(
    private readonly cycleId: string,
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.startedAt = clock();
  }

  async run<Value>(
    stage: string,
    context: SafeCycleContext,
    operation: () => Promise<Value>,
  ): Promise<Value> {
    const span = this.begin(stage, context);
    try {
      const value = await operation();
      this.finish(span, "completed");
      return value;
    } catch (error) {
      this.finish(span, "failed", this.errorContext(error));
      throw error;
    }
  }

  begin(stage: string, context: SafeCycleContext): CycleTraceSpan {
    const startedAt = this.clock();
    const token = ++this.sequence;
    this.openSpans.set(token, { stage, context, startedAt });
    this.append({
      sequence: token,
      elapsedMs: this.elapsed(startedAt),
      durationMs: 0,
      stage: this.scalar(stage),
      outcome: "started",
      context: this.safeContext(context),
    });
    return { token };
  }

  finish(
    span: CycleTraceSpan,
    outcome: Exclude<CycleTraceOutcome, "started">,
    context: SafeCycleContext = {},
  ): void {
    const open = this.openSpans.get(span.token);
    if (!open) return;
    this.openSpans.delete(span.token);
    const endedAt = this.clock();
    const event = this.record(
      open.stage,
      outcome,
      { ...open.context, ...context },
      endedAt,
      open.startedAt,
    );
    if (outcome === "failed") this.firstFailure ??= event;
  }

  currentStage(): string | undefined {
    return [...this.openSpans.values()].at(-1)?.stage;
  }

  stage(stage: string, context: SafeCycleContext): void {
    this.record(stage, "completed", context, this.clock(), this.clock());
  }

  fail(stage: string, error: unknown, context: SafeCycleContext): void {
    const failed = this.record(
      stage,
      "failed",
      { ...context, ...this.errorContext(error) },
      this.clock(),
      this.clock(),
    );
    this.firstFailure ??= failed;
  }

  transaction(status: CycleTransactionStatus): void {
    this.transactionStatus = status;
  }

  progressUpdate(
    input: Partial<{
      memberCount: number;
      scannedPageCount: number;
      scannedAttemptCount: number;
      acceptedCount: number;
      settlementUserCount: number;
    }>,
  ): void {
    this.progress = { ...this.progress, ...input };
  }

  snapshot(): CycleTraceSnapshot {
    const events = this.events.snapshot((event) => ({
      ...event,
      context: { ...event.context },
    }));
    return {
      cycleId: this.cycleId,
      durationMs: this.elapsed(this.clock()),
      transactionStatus: this.transactionStatus,
      events: events.values,
      droppedEventCount: events.dropped,
      progress: { ...this.progress },
      firstFailure: this.firstFailure
        ? { ...this.firstFailure, context: { ...this.firstFailure.context } }
        : undefined,
    };
  }

  dispose(): void {
    this.events.clear();
    this.openSpans.clear();
    this.firstFailure = undefined;
  }

  private record(
    stage: string,
    outcome: CycleTraceOutcome,
    context: SafeCycleContext,
    endedAt: number,
    startedAt: number,
  ): CycleTraceEvent {
    const event = {
      sequence: ++this.sequence,
      elapsedMs: this.elapsed(endedAt),
      durationMs: Math.max(0, endedAt - startedAt),
      stage: this.scalar(stage),
      outcome,
      context: this.safeContext(context),
    };
    this.append(event);
    return event;
  }

  private append(event: CycleTraceEvent): void {
    this.events.push(event);
  }

  private elapsed(now: number): number {
    return Math.max(0, now - this.startedAt);
  }

  private safeContext(context: SafeCycleContext): SafeCycleContext {
    return Object.fromEntries(
      Object.entries(context)
        .filter(([key]) => safeContextNames.has(key))
        .map(([key, value]) => [
          this.scalar(key),
          typeof value === "string" ? this.scalar(value) : value,
        ]),
    );
  }

  private scalar(value: string): string {
    return Array.from(value, (character) => {
      const code = character.charCodeAt(0);
      return code <= 31 ||
        code === 127 ||
        character === "`" ||
        character === "@"
        ? " "
        : character;
    })
      .join("")
      .slice(0, 160);
  }

  private errorContext(error: unknown): SafeCycleContext {
    if (!(error instanceof Error)) return {};
    const context: {
      errorKind?: string;
      errno?: number;
      sqlState?: string;
      httpStatus?: number;
    } = {};
    if (
      new Set([
        "TypeError",
        "RangeError",
        "JungolError",
        "BoundaryError",
        "PersistenceError",
      ]).has(error.name)
    )
      context.errorKind = error.name;
    const errno = Reflect.get(error, "errno");
    if (typeof errno === "number" && Number.isSafeInteger(errno))
      context.errno = errno;
    const sqlState = Reflect.get(error, "sqlState");
    if (typeof sqlState === "string" && /^[0-9A-Z]{5}$/.test(sqlState))
      context.sqlState = sqlState;
    const httpStatus =
      error instanceof JungolError
        ? error.diagnostics?.httpStatus
        : Reflect.get(error, "httpStatus");
    if (
      typeof httpStatus === "number" &&
      Number.isInteger(httpStatus) &&
      httpStatus >= 100 &&
      httpStatus <= 599
    )
      context.httpStatus = httpStatus;
    const diagnostics =
      error instanceof JungolError ? error.diagnostics : undefined;
    return {
      ...context,
      ...(diagnostics?.problemId === undefined
        ? {}
        : { problemId: diagnostics.problemId }),
      ...(diagnostics?.timeoutMs === undefined
        ? {}
        : { timeoutMs: diagnostics.timeoutMs }),
      ...(diagnostics?.imageObserved === undefined
        ? {}
        : { imageObserved: diagnostics.imageObserved }),
      ...(diagnostics?.titleObserved === undefined
        ? {}
        : { titleObserved: diagnostics.titleObserved }),
    };
  }
}
