import { z } from "zod";

export class WorkerPoolError extends Error {
  override readonly name = "WorkerPoolError";
  constructor(
    readonly code: "invalid_concurrency" | "cancelled" | "job_failed",
  ) {
    super(code);
  }
}
export type WorkerResult<T> =
  | { readonly kind: "success"; readonly value: T }
  | { readonly kind: "failure"; readonly error: Error };
/** 실패를 사용자별 결과로 격리하면서 시작되는 작업 수를 제한한다. */
export class AccountWorkerPool {
  private readonly concurrency: number;

  constructor(concurrency: number) {
    const parsed = z.number().int().positive().max(16).safeParse(concurrency);
    if (!parsed.success) throw new WorkerPoolError("invalid_concurrency");
    this.concurrency = parsed.data;
  }

  async run<T, R>(
    jobs: readonly T[],
    signal: AbortSignal,
    work: (job: T, index: number, signal: AbortSignal) => Promise<R>,
  ): Promise<readonly WorkerResult<R>[]> {
    const iterator = jobs.entries();
    const results = new Map<number, WorkerResult<R>>();
    await Promise.all(
      Array.from(
        { length: Math.min(this.concurrency, jobs.length) },
        async () => {
          for (const [index, job] of iterator) {
            if (signal.aborted) {
              results.set(index, {
                kind: "failure",
                error: new WorkerPoolError("cancelled"),
              });
              continue;
            }
            try {
              results.set(index, {
                kind: "success",
                value: await work(job, index, signal),
              });
            } catch (error) {
              results.set(index, {
                kind: "failure",
                error:
                  error instanceof Error
                    ? error
                    : new WorkerPoolError("job_failed"),
              });
            }
          }
        },
      ),
    );
    return [...results.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, result]) => result);
  }
}
