import { errors, type Page } from "playwright";
import { BoundaryError } from "../errors.js";
import { JungolError } from "./errors.js";

export type BrowserSettings = {
  readonly baseUrl: string;
  readonly pageTimeoutMs: number;
};
/** AbortSignal을 Playwright page 종료로 연결하고 외부 예외를 안전한 코드로 변환한다. */
export class PageOperation {
  async run<T>(
    page: Page,
    signal: AbortSignal | undefined,
    work: () => Promise<T>,
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
        throw new JungolError("browser_failed", {
          stage: "page_operation",
          reason: "timeout",
        });
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
          throw new JungolError("browser_failed", {
            stage: "page_operation",
            reason: "network",
            transportCode: code,
          });
        throw new JungolError("browser_failed");
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }
}
