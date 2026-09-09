import { setTimeout as sleep } from "node:timers/promises";

type ServiceOptions = {
  readonly cycle: (
    signal: AbortSignal,
  ) => Promise<"continue" | "circuit_open"> | Promise<void>;
  readonly close: () => Promise<void>;
  readonly delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly intervalMs: number;
  readonly runOnce: boolean;
};

/** 작업이 끝난 뒤 delay를 시작해 느린 cycle 위에 다음 cycle이 겹치지 않게 한다. */
export class FixedDelayScheduler {
  constructor(
    private readonly delay: (
      milliseconds: number,
      signal: AbortSignal,
    ) => Promise<void> = (milliseconds, signal) =>
      sleep(milliseconds, undefined, { signal }),
  ) {}

  async run(
    task: (
      signal: AbortSignal,
    ) => Promise<"continue" | "circuit_open"> | Promise<void>,
    intervalMs: number,
    runOnce: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    let circuitOpen = false;
    while (!signal.aborted) {
      if (!circuitOpen) circuitOpen = (await task(signal)) === "circuit_open";
      if (runOnce || signal.aborted) break;
      try {
        if (circuitOpen) await sleep(2147483647, undefined, { signal });
        else await this.delay(intervalMs, signal);
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
    }
  }
}

/** cycle 완료 시점부터 다음 delay를 재므로 실행이 겹치지 않는 프로세스 수명을 관리한다. */
export class CollectorService {
  private readonly controller = new AbortController();
  private readonly scheduler: FixedDelayScheduler;

  constructor(private readonly options: ServiceOptions) {
    this.scheduler = new FixedDelayScheduler(options.delay);
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
