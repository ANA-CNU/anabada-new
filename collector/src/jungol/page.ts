import { errors, type Page } from "playwright";
import { sourceLocationFrom } from "../application/safe-source-location.js";
import { BoundaryError } from "../errors.js";
import { JungolError, type SafeJungolDiagnostics } from "./errors.js";

export type BrowserSettings = {
  readonly baseUrl: string;
  readonly pageTimeoutMs: number;
};
export type PageCloser = Pick<Page, "close">;
export type PageFailureContext = {
  readonly code:
    | "browser_failed"
    | "group_feed_request_queue_wait_failed"
    | "group_feed_navigation_failed"
    | "group_feed_loadmore_failed"
    | "group_feed_responsewait_failed"
    | "group_feed_header_failed"
    | "group_feed_rows_failed"
    | "group_members_timeout";
  readonly stage:
    | "page_operation"
    | "request_queue_wait"
    | "navigation"
    | "loadmore"
    | "responsewait"
    | "header"
    | "rows"
    | "group_members_readiness";
  readonly pageNumber?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly endpointPath?: string | undefined;
};

const defaultFailureContext: PageFailureContext = {
  code: "browser_failed",
  stage: "page_operation",
};
/** AbortSignal을 Playwright page 종료로 연결하고 외부 예외를 안전한 코드로 변환한다. */
export class PageOperation {
  async run<T>(
    page: PageCloser,
    signal: AbortSignal | undefined,
    work: () => Promise<T>,
    failureContext: PageFailureContext = defaultFailureContext,
  ): Promise<T> {
    if (signal?.aborted) throw new JungolError("cancelled");
    const cancel = () => {
      void page.close().catch((error: unknown) => {
        if (!(error instanceof Error)) throw error;
      });
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      return await work();
    } catch (error) {
      if (signal?.aborted) throw new JungolError("cancelled");
      if (error instanceof JungolError || error instanceof BoundaryError)
        throw error;
      if (error instanceof errors.TimeoutError)
        throw new JungolError(
          failureContext.code,
          this.diagnostics(failureContext, "timeout", error),
        );
      if (error instanceof Error) {
        const code =
          /\b(ECONNREFUSED|ECONNRESET|ENETUNREACH|ENOTFOUND|ETIMEDOUT)\b/.exec(
            error.message,
          )?.[1];
        if (
          code === "ECONNREFUSED" ||
          code === "ECONNRESET" ||
          code === "ENETUNREACH" ||
          code === "ENOTFOUND" ||
          code === "ETIMEDOUT"
        )
          throw new JungolError(failureContext.code, {
            ...this.diagnostics(failureContext, "network", error),
            transportCode: code,
          });
        throw new JungolError(
          failureContext.code,
          this.diagnostics(failureContext, "internal", error),
        );
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }

  private diagnostics(
    context: PageFailureContext,
    reason: SafeJungolDiagnostics["reason"],
    error: Error,
  ): SafeJungolDiagnostics {
    const location = sourceLocationFrom(error, "PageOperation.run");
    return {
      stage: context.stage,
      reason,
      ...(context.pageNumber === undefined
        ? {}
        : { pageNumber: context.pageNumber }),
      ...(context.timeoutMs === undefined
        ? {}
        : { timeoutMs: context.timeoutMs }),
      ...(location === undefined ? {} : { location }),
      ...(error.name === "Error" ||
      error.name === "TypeError" ||
      error.name === "RangeError" ||
      error.name === "TimeoutError"
        ? { originalErrorKind: error.name }
        : {}),
    };
  }
}
