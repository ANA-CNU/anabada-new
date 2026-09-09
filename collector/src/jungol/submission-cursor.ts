import type { Page, Response } from "playwright";
import {
  type AccountSyncPlan,
  InitialSubmissionCursor,
} from "../domain/sync.js";
import { SubmissionWireDecoder } from "../wire.js";
import { JungolError } from "./errors.js";
import { type BrowserSettings, PageOperation } from "./page.js";
import type { JungolRequestCoordinator } from "./request-coordinator.js";

/** 초기 기준선에 쓸 첫 제출 페이지의 가장 최신 제출 번호를 수집한다. */
export class SubmissionCursorCollector {
  constructor(
    private readonly settings: BrowserSettings,
    private readonly requests: JungolRequestCoordinator,
    private readonly decoder = new SubmissionWireDecoder(),
    private readonly pages = new PageOperation(),
  ) {}

  collect(
    page: Page,
    plan: AccountSyncPlan,
    signal?: AbortSignal,
  ): Promise<InitialSubmissionCursor> {
    if (
      plan.mode !== "initial_summary" ||
      plan.cursorBefore !== 0n ||
      plan.maxPages !== 1
    )
      return Promise.reject(new JungolError("invalid_plan"));
    return this.pages.run(page, signal, async () => {
      const response = await this.requests.schedule(
        "submission_page",
        signal,
        () => this.openFirstPage(page, plan),
      );
      if (!response.ok()) throw new JungolError("submission_http_failed");
      const [body, headers] = await Promise.all([
        response.body(),
        response.request().allHeaders(),
      ]);
      const attempts = this.decoder.decode(body, headers["x-fp"]).attempts;
      if (attempts.length === 0) {
        if (plan.member.solvedCount > 0)
          throw new JungolError("submission_cursor_stale");
        return new InitialSubmissionCursor(0n, 0);
      }
      let previous: bigint | undefined;
      for (const attempt of attempts) {
        const current = BigInt(attempt.submissionId);
        if (previous !== undefined && current >= previous)
          throw new JungolError("submission_order_invalid");
        previous = current;
      }
      return new InitialSubmissionCursor(
        previous === undefined ? 0n : BigInt(attempts[0]?.submissionId ?? "0"),
        attempts.length,
      );
    });
  }

  private async openFirstPage(
    page: Page,
    plan: AccountSyncPlan,
  ): Promise<Response> {
    const matches = (response: Response): boolean => {
      const url = new URL(response.url());
      return (
        url.origin === new URL(this.settings.baseUrl).origin &&
        url.pathname === "/api/submission"
      );
    };
    const response = await Promise.all([
      page.waitForResponse(matches, { timeout: this.settings.pageTimeoutMs }),
      page.goto(
        new URL(
          `/account/${plan.member.accountId}/submission`,
          this.settings.baseUrl,
        ).href,
        { waitUntil: "domcontentloaded", timeout: this.settings.pageTimeoutMs },
      ),
    ]);
    return response[0];
  }
}
