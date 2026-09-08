import { setTimeout } from "node:timers/promises";
import { JungolError } from "./errors.js";

export const jungolOperationKinds = [
  "auth_probe",
  "auth_submit",
  "rank_page",
  "submission_page",
  "submission_next_page",
  "problem_metadata",
] as const;
export type JungolOperationKind = (typeof jungolOperationKinds)[number];

type Delay = (milliseconds: number) => Promise<void>;
type CoordinatorOptions = { readonly delay?: Delay };
type BrowserRequest = {
  url(): string;
  resourceType(): string;
};
type BrowserRoute = {
  request(): BrowserRequest;
  abort(): Promise<void>;
  continue(): Promise<void>;
};
export type JungolBrowserContext = {
  route(
    pattern: string,
    handler: (route: BrowserRoute) => Promise<void>,
  ): Promise<unknown>;
};
type Job = {
  readonly signal: AbortSignal | undefined;
  readonly work: () => Promise<void>;
  readonly reject: (reason?: unknown) => void;
};

/** Jungol 요청을 process 단위 FIFO로 직렬화하고 완료 뒤 3초 간격을 강제한다. */
export class JungolRequestCoordinator {
  private readonly queue: Job[] = [];
  private active = false;
  private closed = false;
  private hasSettled = false;
  private readonly delay: Delay;

  constructor(options: CoordinatorOptions = {}) {
    this.delay = options.delay ?? ((milliseconds) => setTimeout(milliseconds));
  }

  schedule<T>(
    _kind: JungolOperationKind,
    signal: AbortSignal | undefined,
    work: () => Promise<T>,
  ): Promise<T> {
    if (this.closed) return Promise.reject(new JungolError("closed"));
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        signal,
        work: async () => resolve(await work()),
        reject,
      });
      void this.drain();
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const job of this.queue.splice(0))
      job.reject(new JungolError("closed"));
  }

  async configureContext(
    context: JungolBrowserContext,
    baseUrl: string,
  ): Promise<void> {
    const jungolOrigin = new URL(baseUrl).origin;
    await context.route("**/*", async (route) => {
      const request = route.request();
      const blocksResource = ["image", "font", "media"].includes(
        request.resourceType(),
      );
      if (new URL(request.url()).origin === jungolOrigin && blocksResource)
        await route.abort();
      else await route.continue();
    });
  }

  private async drain(): Promise<void> {
    if (this.active) return;
    this.active = true;
    try {
      while (true) {
        const job = this.queue.shift();
        if (!job) return;
        if (this.closed) {
          job.reject(new JungolError("closed"));
          continue;
        }
        if (job.signal?.aborted) {
          job.reject(new JungolError("cancelled"));
          continue;
        }
        if (this.hasSettled && !this.closed) await this.delay(3000);
        if (this.closed) {
          job.reject(new JungolError("closed"));
          continue;
        }
        if (job.signal?.aborted) {
          job.reject(new JungolError("cancelled"));
          continue;
        }
        try {
          await job.work();
        } catch (error) {
          job.reject(error);
        }
        this.hasSettled = true;
      }
    } finally {
      this.active = false;
      if (this.queue.length > 0 && !this.closed) void this.drain();
    }
  }
}
