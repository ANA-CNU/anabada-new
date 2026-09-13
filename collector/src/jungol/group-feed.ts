import type { Page, Response } from "playwright";
import type { CycleTrace } from "../application/cycle-diagnostics.js";
import type { GroupFeedPage } from "../application/group-feed-scan-policy.js";
import type { RankMemberSnapshot } from "../domain/sync.js";
import { BoundaryError } from "../errors.js";
import type { GroupAcceptedSubmission } from "../group-domain.js";
import { GroupFeedCursorError } from "../group-feed-error.js";
import { JungolError } from "./errors.js";
import {
  GroupActorResolver,
  GroupActorUnresolvedError,
  GroupWireDecoder,
} from "./group-wire.js";
import {
  type BrowserSettings,
  type PageFailureContext,
  PageOperation,
} from "./page.js";
import type { JungolRequestCoordinator } from "./request-coordinator.js";

export class GroupFeedContractError extends BoundaryError {
  constructor(
    code: BoundaryError["code"],
    readonly httpStatus?: number,
  ) {
    super(code);
  }
}

type GroupFeedPageState = {
  readonly nextCursor: string | null;
  readonly more: boolean;
};

/** 실제 group 페이지 request만 이용해 checkpoint cursor를 재개하는 AC feed adapter다. */
export class GroupFeedCollector {
  private readonly pageState = new WeakMap<Page, GroupFeedPageState>();
  private readonly pageNumbers = new WeakMap<Page, number>();

  constructor(
    private readonly settings: BrowserSettings,
    private readonly requests: JungolRequestCoordinator,
    private readonly decoder = new GroupWireDecoder(),
    private readonly pages = new PageOperation(),
    private readonly trace?: CycleTrace,
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
        const queuedAt = performance.now();
        const pageNumber = (this.pageNumbers.get(page) ?? 0) + 1;
        this.pageNumbers.set(page, pageNumber);
        const queueSpan = this.trace?.begin("request_queue_wait", {
          pageNumber,
          timeoutMs: this.settings.pageTimeoutMs,
          endpointPath: "/api/group/1125/submission",
        });
        let queueCallbackStarted = false;
        let result: GroupFeedPage;
        try {
          result = await this.requests.schedule(
            canLoadMore ? "submission_next_page" : "submission_page",
            signal,
            async () => {
              queueCallbackStarted = true;
              if (queueSpan)
                this.trace?.finish(queueSpan, "completed", {
                  pageNumber,
                  timeoutMs: this.settings.pageTimeoutMs,
                  queueWaitMs: Math.max(
                    0,
                    Math.round(performance.now() - queuedAt),
                  ),
                });
              const responsePromise = page.waitForResponse(matches, {
                timeout: this.settings.pageTimeoutMs,
              });
              void responsePromise.catch(() => undefined);
              if (canLoadMore) {
                await this.runPageStep(
                  page,
                  signal,
                  groupFeedFailure(
                    "group_feed_loadmore_failed",
                    "loadmore",
                    pageNumber,
                    this.settings.pageTimeoutMs,
                  ),
                  () =>
                    page
                      .getByRole("button", {
                        name: "더 불러오기",
                        exact: true,
                      })
                      .click({ timeout: this.settings.pageTimeoutMs }),
                );
              } else {
                await this.runPageStep(
                  page,
                  signal,
                  groupFeedFailure(
                    "group_feed_navigation_failed",
                    "navigation",
                    pageNumber,
                    this.settings.pageTimeoutMs,
                  ),
                  () =>
                    page.goto(
                      new URL(
                        "/group/1125/submission?result=AC",
                        this.settings.baseUrl,
                      ).href,
                      {
                        waitUntil: "domcontentloaded",
                        timeout: this.settings.pageTimeoutMs,
                      },
                    ),
                );
                if (page.url().includes("/auth/signin"))
                  throw new JungolError("auth_required");
              }
              const response = await this.runPageStep(
                page,
                signal,
                groupFeedFailure(
                  "group_feed_responsewait_failed",
                  "responsewait",
                ),
                () => responsePromise,
              );
              this.trace?.stage("submission_response_observed", {
                pageNumber,
                responseObserved: true,
                httpStatus: response.status(),
              });
              if (response.status() === 403 || response.status() === 429) {
                this.trace?.stage("submission_response_status", {
                  httpStatus: response.status(),
                });
                throw new JungolError("jungol_http_rejected", {
                  stage: "status",
                  reason: "http",
                  httpStatus: response.status(),
                });
              }
              if (!response.ok()) {
                this.trace?.stage("submission_response_status", {
                  httpStatus: response.status(),
                });
                throw new GroupFeedContractError(
                  "group_feed_http_failed",
                  response.status(),
                );
              }
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
              this.trace?.stage("submission_fingerprint", { pageNumber });
              this.trace?.stage("submission_bson", { pageNumber });
              this.trace?.stage("submission_schema", { pageNumber });
              await this.runPageStep(
                page,
                signal,
                groupFeedFailure("group_feed_header_failed", "header"),
                () =>
                  page.getByRole("columnheader").first().waitFor({
                    state: "visible",
                    timeout: this.settings.pageTimeoutMs,
                  }),
              );
              if (decoded.entries.length > 0)
                await this.runPageStep(
                  page,
                  signal,
                  groupFeedFailure("group_feed_rows_failed", "rows"),
                  () =>
                    page
                      .getByRole("table")
                      .first()
                      .locator("tr")
                      .nth(1)
                      .waitFor({
                        state: "visible",
                        timeout: this.settings.pageTimeoutMs,
                      }),
                );
              const resolver = new GroupActorResolver(members);
              const submissions = decoded.entries.map(
                (entry): GroupAcceptedSubmission => {
                  if (entry.result !== "AC")
                    throw new GroupFeedContractError(
                      "group_feed_non_ac_result",
                    );
                  return {
                    accountId: resolver.accountIdFor(
                      entry.actorHandle,
                      entry,
                      decoded.entries.length,
                    ),
                    submissionId: entry.submissionId,
                    problemId: entry.problemId,
                    submittedAt: entry.submittedAt,
                    score: entry.score,
                  };
                },
              );
              this.trace?.stage("submission_actor", {
                pageNumber,
                matchedCount: submissions.length,
              });
              this.trace?.stage("submission_cursor", {
                pageNumber,
                cursorPresent: decoded.paging.cursor !== null,
              });
              return {
                submissions,
                nextCursor: decoded.paging.more ? decoded.paging.cursor : null,
                more: decoded.paging.more,
              };
            },
          );
        } catch (error) {
          if (queueSpan && !queueCallbackStarted)
            this.trace?.finish(queueSpan, "failed", { code: "cancelled" });
          throw error;
        }
        if (page.isClosed()) this.pageState.delete(page);
        else
          this.pageState.set(page, {
            nextCursor: result.nextCursor,
            more: result.more,
          });
        return result;
      } catch (error) {
        this.pageState.delete(page);
        this.recordFailure(error);
        throw error;
      } finally {
        if (expectedCursor !== null && !canLoadMore)
          await page.unroute("**/api/group/1125/submission*", route);
      }
    });
  }

  private runPageStep<Value>(
    page: Page,
    signal: AbortSignal | undefined,
    context: PageFailureContext,
    operation: () => Promise<Value>,
  ): Promise<Value> {
    const pageOperation = () =>
      this.pages.run(page, signal, operation, context);
    return this.trace
      ? this.trace.run(
          this.traceStage(context.stage),
          {
            code: context.code,
            pageNumber: context.pageNumber ?? 0,
            timeoutMs: context.timeoutMs ?? this.settings.pageTimeoutMs,
            endpointPath: context.endpointPath ?? "/api/group/1125/submission",
          },
          pageOperation,
        )
      : pageOperation();
  }

  private recordFailure(error: unknown): void {
    if (error instanceof GroupFeedCursorError)
      this.trace?.fail("submission_cursor", error, { code: error.code });
    else if (error instanceof GroupFeedContractError)
      this.trace?.fail(
        error.code === "group_feed_non_ac_result"
          ? "submission_schema"
          : "submission_response_status",
        error,
        {
          code: error.code,
          ...(error.httpStatus === undefined
            ? {}
            : { httpStatus: error.httpStatus }),
        },
      );
    else if (error instanceof GroupActorUnresolvedError)
      this.trace?.fail("submission_actor", error, {
        code: error.code,
        submissionId: error.diagnostics.submissionId,
        problemId: error.diagnostics.problemId,
        actorHandle: error.diagnostics.actorHandle,
        memberCount: error.diagnostics.memberCount,
        responseCount: error.diagnostics.responseCount,
        matchedCount: error.diagnostics.matchedCount,
      });
    else if (error instanceof BoundaryError)
      this.trace?.fail(this.boundaryStage(error.code), error, {
        code: error.code,
      });
    else if (error instanceof JungolError)
      this.trace?.fail(
        error.code === "jungol_http_rejected"
          ? "submission_response_status"
          : (error.diagnostics?.stage ?? "submission_response_wait"),
        error,
        {
          code: error.code,
          ...(error.diagnostics?.httpStatus === undefined
            ? {}
            : { httpStatus: error.diagnostics.httpStatus }),
        },
      );
  }

  private boundaryStage(
    code: BoundaryError["code"],
  ): "submission_fingerprint" | "submission_bson" | "submission_schema" {
    switch (code) {
      case "invalid_fingerprint":
        return "submission_fingerprint";
      case "invalid_bson":
        return "submission_bson";
      default:
        return "submission_schema";
    }
  }

  private traceStage(stage: PageFailureContext["stage"]): string {
    switch (stage) {
      case "navigation":
        return "page_navigation";
      case "loadmore":
        return "submission_load_more";
      case "responsewait":
        return "submission_response_wait";
      case "header":
        return "submission_header_wait";
      case "rows":
        return "submission_rows_wait";
      default:
        return stage;
    }
  }
}

const groupFeedFailure = (
  code: PageFailureContext["code"],
  stage: PageFailureContext["stage"],
  pageNumber?: number,
  timeoutMs?: number,
): PageFailureContext => ({ code, stage, pageNumber, timeoutMs });
