import type { Page, Response } from "playwright";
import type { GroupFeedPage } from "../application/group-feed-scan-policy.js";
import type { RankMemberSnapshot } from "../domain/sync.js";
import { BoundaryError } from "../errors.js";
import type { GroupAcceptedSubmission } from "../group-domain.js";
import { GroupFeedCursorError } from "../group-feed-error.js";
import { JungolError } from "./errors.js";
import { GroupActorResolver, GroupWireDecoder } from "./group-wire.js";
import { type BrowserSettings, PageOperation } from "./page.js";
import type { JungolRequestCoordinator } from "./request-coordinator.js";

export class GroupFeedContractError extends BoundaryError {}

type GroupFeedPageState = {
  readonly nextCursor: string | null;
  readonly more: boolean;
};

/** 실제 group 페이지 request만 이용해 checkpoint cursor를 재개하는 AC feed adapter다. */
export class GroupFeedCollector {
  private readonly pageState = new WeakMap<Page, GroupFeedPageState>();

  constructor(
    private readonly settings: BrowserSettings,
    private readonly requests: JungolRequestCoordinator,
    private readonly decoder = new GroupWireDecoder(),
    private readonly pages = new PageOperation(),
  ) {}

  readPage(
    page: Page,
    members: readonly RankMemberSnapshot[],
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<GroupFeedPage> {
    return this.pages.run(page, signal, async () => {
      if (page.isClosed()) this.pageState.delete(page);
      const expectedCursor = cursor;
      const priorState = this.pageState.get(page);
      const canLoadMore =
        expectedCursor !== null &&
        priorState?.more === true &&
        priorState.nextCursor === expectedCursor;
      const baseUrl = new URL(this.settings.baseUrl);
      let cursorRouteUsed = false;
      const matches = (response: Response): boolean => {
        const url = new URL(response.url());
        return (
          url.origin === baseUrl.origin &&
          url.pathname === "/api/group/1125/submission" &&
          url.searchParams.get("result") === "AC"
        );
      };
      const route = async (requestRoute: {
        request(): { url(): string };
        continue(options?: { url: string }): Promise<void>;
      }) => {
        const url = new URL(requestRoute.request().url());
        if (
          url.origin !== baseUrl.origin ||
          url.pathname !== "/api/group/1125/submission" ||
          expectedCursor === null ||
          cursorRouteUsed
        )
          return requestRoute.continue();
        cursorRouteUsed = true;
        url.searchParams.set("result", "AC");
        url.searchParams.set("cursor", expectedCursor);
        await requestRoute.continue({ url: url.href });
      };
      if (expectedCursor !== null && !canLoadMore)
        await page.route("**/api/group/1125/submission*", route);
      try {
        const result = await this.requests.schedule(
          canLoadMore ? "submission_next_page" : "submission_page",
          signal,
          async () => {
            const responsePromise = page.waitForResponse(matches, {
              timeout: this.settings.pageTimeoutMs,
            });
            void responsePromise.catch(() => undefined);
            if (canLoadMore) {
              await page
                .getByRole("button", {
                  name: "더 불러오기",
                  exact: true,
                })
                .click({ timeout: this.settings.pageTimeoutMs });
            } else {
              await page.goto(
                new URL(
                  "/group/1125/submission?result=AC",
                  this.settings.baseUrl,
                ).href,
                {
                  waitUntil: "domcontentloaded",
                  timeout: this.settings.pageTimeoutMs,
                },
              );
              if (page.url().includes("/auth/signin"))
                throw new JungolError("auth_required");
            }
            const response = await responsePromise;
            if (response.status() === 403 || response.status() === 429)
              throw new JungolError("jungol_http_rejected");
            if (!response.ok())
              throw new GroupFeedContractError("group_feed_http_failed");
            if (page.url().includes("/auth/signin"))
              throw new JungolError("auth_required");
            const responseUrl = new URL(response.url());
            if (
              expectedCursor !== null &&
              responseUrl.searchParams.get("cursor") !== expectedCursor
            )
              throw new GroupFeedCursorError();
            const [body, headers] = await Promise.all([
              response.body(),
              response.request().allHeaders(),
            ]);
            const decoded = this.decoder.decode(body, headers["x-fp"]);
            await page.getByRole("columnheader").first().waitFor({
              state: "visible",
              timeout: this.settings.pageTimeoutMs,
            });
            if (decoded.entries.length > 0)
              await page
                .getByRole("table")
                .first()
                .locator("tr")
                .nth(1)
                .waitFor({
                  state: "visible",
                  timeout: this.settings.pageTimeoutMs,
                });
            const resolver = new GroupActorResolver(members);
            const submissions = decoded.entries.map(
              (entry): GroupAcceptedSubmission => {
                if (entry.result !== "AC")
                  throw new GroupFeedContractError("group_feed_non_ac_result");
                return {
                  accountId: resolver.accountIdFor(entry.actorHandle),
                  submissionId: entry.submissionId,
                  problemId: entry.problemId,
                  submittedAt: entry.submittedAt,
                  score: entry.score,
                };
              },
            );
            return {
              submissions,
              nextCursor: decoded.paging.more ? decoded.paging.cursor : null,
              more: decoded.paging.more,
            };
          },
        );
        if (page.isClosed()) this.pageState.delete(page);
        else
          this.pageState.set(page, {
            nextCursor: result.nextCursor,
            more: result.more,
          });
        return result;
      } catch (error) {
        this.pageState.delete(page);
        throw error;
      } finally {
        if (expectedCursor !== null && !canLoadMore)
          await page.unroute("**/api/group/1125/submission*", route);
      }
    });
  }
}
