import { setTimeout as sleep } from "node:timers/promises";

type ServiceOptions = {
  readonly cycle: (
    signal: AbortSignal,
  ) => Promise<"continue" | "circuit_open"> | Promise<void>;
  readonly close: () => Promise<void>;
  readonly delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly intervalMs: number;
  readonly now?: () => number;
  readonly runOnce: boolean;
};

/** 최초 실행은 다음 정각 경계에 맞추고 이후 누락된 slot을 건너뛴다. */
export class ClockAlignedScheduler {
  constructor(
    private readonly delay: (
      milliseconds: number,
      signal: AbortSignal,
    ) => Promise<void> = (milliseconds, signal) =>
      sleep(milliseconds, undefined, { signal }),
    private readonly now: () => number = Date.now,
  ) {}

  async run(
    task: (
      signal: AbortSignal,
    ) => Promise<"continue" | "circuit_open"> | Promise<void>,
    intervalMs: number,
    runOnce: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    if (runOnce) {
      if (!signal.aborted) await task(signal);
      return;
    }
    let circuitOpen = false;
    let allowCurrentBoundary = true;
    while (!signal.aborted) {
      try {
        await this.delay(
          circuitOpen
            ? 2_147_483_647
            : this.untilNextBoundary(intervalMs, allowCurrentBoundary),
          signal,
        );
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            error.name === "AbortError" &&
            signal.aborted
          )
        )
          throw error;
      }
      if (signal.aborted || circuitOpen) continue;
      circuitOpen = (await task(signal)) === "circuit_open";
      allowCurrentBoundary = false;
    }
  }

  private untilNextBoundary(
    intervalMs: number,
    allowCurrentBoundary: boolean,
  ): number {
    const remainder = this.now() % intervalMs;
    if (remainder === 0) return allowCurrentBoundary ? 0 : intervalMs;
    return intervalMs - remainder;
  }
}

export class CollectorService {
  private readonly controller = new AbortController();
  private readonly scheduler: ClockAlignedScheduler;

  constructor(private readonly options: ServiceOptions) {
    this.scheduler = new ClockAlignedScheduler(options.delay, options.now);
  }

  stop(): void {
    this.controller.abort();
  }

  async run(): Promise<void> {
    const signal = this.controller.signal;
    try {
      await this.scheduler.run(
        this.options.cycle,
        this.options.intervalMs,
        this.options.runOnce,
        signal,
      );
    } finally {
      await this.options.close();
    }
  }
}
