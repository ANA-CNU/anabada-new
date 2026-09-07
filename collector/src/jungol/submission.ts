import { setTimeout } from "node:timers/promises";
import type { Page, Response } from "playwright";
import type { AccountSyncPlan } from "../domain/sync.js";
import type { SubmissionAttempt } from "../domain.js";
import { SubmissionWireDecoder } from "../wire.js";
import { JungolError } from "./errors.js";
import { type BrowserSettings, PageOperation } from "./page.js";

export type CollectedSubmissions = {
  readonly attempts: readonly SubmissionAttempt[];
  readonly highestInspectedId: bigint;
  readonly pageCount: number;
  readonly cursorReached: true;
};
/** API 페이지를 cursor까지 완전히 읽고 저장 여부와 무관한 최고 검사 제출 번호를 보존한다. */
export class SubmissionCollector {
  constructor(
    private readonly settings: BrowserSettings,
    private readonly decoder = new SubmissionWireDecoder(),
    private readonly pages = new PageOperation(),
  ) {}
  collect(
    page: Page,
    plan: AccountSyncPlan,
    signal?: AbortSignal,
  ): Promise<CollectedSubmissions> {
    return this.pages.run(page, signal, async () => {
      if (
        plan.cursorBefore < 0n ||
        !Number.isSafeInteger(plan.maxPages) ||
        plan.maxPages < 1
      )
        throw new JungolError("invalid_plan");
      const matches = (response: Response) => {
        const url = new URL(response.url());
        return (
          url.origin === new URL(this.settings.baseUrl).origin &&
          url.pathname === "/api/submission"
        );
      };
      const [initial] = await Promise.all([
        page.waitForResponse(matches, { timeout: this.settings.pageTimeoutMs }),
        page.goto(
          new URL(
            `/account/${plan.member.accountId}/submission`,
            this.settings.baseUrl,
          ).href,
          {
            waitUntil: "domcontentloaded",
            timeout: this.settings.pageTimeoutMs,
          },
        ),
      ]);
      let response = initial;
      let previousId: bigint | null = null;
      let highestInspectedId = plan.cursorBefore;
      const attempts: SubmissionAttempt[] = [];
      const cursors = new Set<string>();
      for (let pageCount = 1; pageCount <= plan.maxPages; pageCount++) {
        if (!response.ok()) throw new JungolError("submission_http_failed");
        const [body, headers] = await Promise.all([
          response.body(),
          response.request().allHeaders(),
        ]);
        const batch = this.decoder.decode(body, headers["x-fp"]);
        if (cursors.has(batch.paging.cursor))
          throw new JungolError("submission_cursor_stale");
        cursors.add(batch.paging.cursor);
        let reached = false;
        for (const attempt of batch.attempts) {
          const id = BigInt(attempt.submissionId);
          if (previousId !== null && id >= previousId)
            throw new JungolError("submission_order_invalid");
          previousId = id;
          if (id > highestInspectedId) highestInspectedId = id;
          if (plan.cursorBefore > 0n && id <= plan.cursorBefore) reached = true;
          if (id > plan.cursorBefore) attempts.push(attempt);
        }
        if (reached || !batch.paging.more)
          return {
            attempts,
            highestInspectedId,
            pageCount,
            cursorReached: true,
          };
        if (batch.attempts.length === 0)
          throw new JungolError("submission_cursor_stale");
        if (pageCount === plan.maxPages)
          throw new JungolError("max_pages_reached_before_cursor");
        if (this.settings.requestDelayMs > 0)
          await setTimeout(this.settings.requestDelayMs, undefined, { signal });
        const button = page.getByRole("button", {
          name: "더 불러오기",
          exact: true,
        });
        const [next] = await Promise.all([
          page.waitForResponse(matches, {
            timeout: this.settings.pageTimeoutMs,
          }),
          button.click({ timeout: this.settings.pageTimeoutMs }),
        ]);
        response = next;
      }
      throw new JungolError("max_pages_reached_before_cursor");
    });
  }
}
