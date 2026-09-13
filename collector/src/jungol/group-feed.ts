import { errors, type Page } from "playwright";
import type { CycleTrace } from "../application/cycle-diagnostics.js";
import {
  GroupFeedFlowLog,
  type GroupFeedFlowStep,
} from "../application/group-feed-flow-log.js";
import type { GroupFeedPage } from "../application/group-feed-scan-policy.js";
import type { GroupFeedResumePosition } from "../application/group-runtime.js";
import { sourceLocationFrom } from "../application/safe-source-location.js";
import type { RankMemberSnapshot } from "../domain/sync.js";
import { JungolError } from "./errors.js";
import { GroupFeedSurface } from "./group-feed-surface.js";
import { GroupSubmissionDomParser } from "./group-submission-dom.js";
import { type BrowserSettings, PageOperation } from "./page.js";
import type { JungolRequestCoordinator } from "./request-coordinator.js";
import { SubmissionTimestampReader } from "./submission-timestamp.js";

type Action = "navigate" | "read" | "load_more";
type Outcome =
  | { readonly kind: "replay" }
  | { readonly kind: "page"; readonly page: GroupFeedPage };

/** Jungol 그룹 AC 제출 표를 DOM 계약으로 읽고 마지막 제출 ID부터 이어서 탐색한다. */
export class GroupFeedCollector {
  private readonly pages = new PageOperation();
  private readonly parser: GroupSubmissionDomParser;
  private readonly surface: GroupFeedSurface;
  constructor(
    private readonly settings: BrowserSettings,
    private readonly requests: JungolRequestCoordinator,
    private readonly trace?: CycleTrace,
  ) {
    this.parser = new GroupSubmissionDomParser(
      new SubmissionTimestampReader(settings.pageTimeoutMs),
    );
    this.surface = new GroupFeedSurface(settings);
  }
  async readPage(
    page: Page,
    members: readonly RankMemberSnapshot[],
    position: GroupFeedResumePosition,
    signal?: AbortSignal,
  ): Promise<GroupFeedPage> {
    const flow = new GroupFeedFlowLog();
    try {
      return await this.pages.run(
        page,
        signal,
        async () => {
          let action: Action =
            position.lastScannedSubmissionId === null ||
            !(await this.surface.isFeedPage(page))
              ? "navigate"
              : "read";
          let replayIndex = 0;
          while (true) {
            const currentAction = action;
            const pageNumber = replayIndex + 1;
            const queueWait = this.trace?.begin("queue_wait", {
              pageNumber,
            });
            let actionStarted = false;
            let result: Outcome;
            try {
              result = await this.requests.schedule(
                currentAction === "load_more"
                  ? "submission_next_page"
                  : "submission_page",
                signal,
                () => {
                  actionStarted = true;
                  if (queueWait) this.trace?.finish(queueWait, "completed");
                  return this.action({
                    page,
                    members,
                    position,
                    flow,
                    action: currentAction,
                    pageNumber,
                  });
                },
              );
            } catch (error) {
              if (!actionStarted && queueWait)
                this.trace?.finish(queueWait, "failed", { code: "queue_wait" });
              throw error;
            }
            if (result.kind === "page") return result.page;
            action = "load_more";
            replayIndex += 1;
          }
        },
        {
          code: "group_feed_rows_failed",
          stage: "rows",
          timeoutMs: this.settings.pageTimeoutMs,
        },
      );
    } finally {
      flow.dispose();
    }
  }
  private async action(input: {
    readonly page: Page;
    readonly members: readonly RankMemberSnapshot[];
    readonly position: GroupFeedResumePosition;
    readonly flow: GroupFeedFlowLog;
    readonly action: Action;
    readonly pageNumber: number;
  }): Promise<Outcome> {
    if (input.action === "navigate")
      await this.stage(input.flow, "navigation", input.pageNumber, () =>
        this.surface.navigate(input.page),
      );
    if (input.action === "load_more")
      await this.loadMore(input.page, input.flow, input.pageNumber);
    await this.stage(input.flow, "table_ready", input.pageNumber, () =>
      this.surface.waitForRows(input.page),
    );
    await this.surface.requireAccessible(input.page);
    const marker = input.position.lastScannedSubmissionId;
    if (marker !== null && (await this.needsReplay(input.page, marker)))
      return { kind: "replay" };
    const rows = await this.surface.rowsBelow(input.page, marker);
    const submissions = await this.stage(
      input.flow,
      "rows_parse",
      input.pageNumber,
      () => this.parser.parse(input.page, rows, input.members),
    );
    return {
      kind: "page",
      page: { submissions, more: await this.surface.settledMore(input.page) },
    };
  }
  private async needsReplay(page: Page, marker: string): Promise<boolean> {
    const ids = await this.surface.ids(page);
    const index = ids.indexOf(marker);
    if (index < 0) {
      if (await this.surface.settledMore(page)) return true;
      throw new JungolError("group_feed_cursor_not_found");
    }
    return index === ids.length - 1 && (await this.surface.settledMore(page));
  }
  private async loadMore(
    page: Page,
    flow: GroupFeedFlowLog,
    pageNumber: number,
  ): Promise<void> {
    const before = (await this.surface.ids(page)).join("|");
    await this.stage(flow, "load_more_click", pageNumber, () =>
      this.surface.clickMore(page),
    );
    await this.stage(flow, "rows_growth_wait", pageNumber, () =>
      this.surface.waitForGrowth(page, before),
    );
  }
  private stage<Value>(
    flow: GroupFeedFlowLog,
    name: GroupFeedFlowStep,
    pageNumber: number,
    operation: () => Promise<Value>,
  ): Promise<Value> {
    const run = async () => {
      try {
        return await flow.runStep(name, operation);
      } catch (error) {
        if (error instanceof errors.TimeoutError)
          throw this.timeout(name, error);
        throw error;
      }
    };
    return this.traceStage(
      name,
      { pageNumber, timeoutMs: this.settings.pageTimeoutMs },
      run,
    );
  }
  private traceStage<Value>(
    name: string,
    context: Readonly<Record<string, number>>,
    operation: () => Promise<Value>,
  ): Promise<Value> {
    return this.trace ? this.trace.run(name, context, operation) : operation();
  }
  private timeout(
    name: GroupFeedFlowStep,
    error: errors.TimeoutError,
  ): JungolError {
    const navigation = name === "navigation";
    const growth = name === "load_more_click" || name === "rows_growth_wait";
    const location = sourceLocationFrom(error, `GroupFeedCollector.${name}`);
    return new JungolError(
      navigation
        ? "group_feed_navigation_failed"
        : growth
          ? "group_feed_loadmore_failed"
          : "group_feed_rows_failed",
      {
        stage: navigation ? "navigation" : growth ? "loadmore" : "rows",
        reason: "timeout",
        timeoutMs: this.settings.pageTimeoutMs,
        ...(location === undefined ? {} : { location }),
        originalErrorKind: "TimeoutError",
      },
    );
  }
}
