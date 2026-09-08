import type { Page } from "playwright";
import { LoginStateDetector } from "../auth-state.js";
import { type AccountSyncPlan, InitialSolvedProblem } from "../domain/sync.js";
import { problemIdSchema } from "../domain.js";
import { JungolError } from "./errors.js";
import { type BrowserSettings, PageOperation } from "./page.js";
import type { JungolRequestCoordinator } from "./request-coordinator.js";

const count = (text: string): number => {
  const matched = /^\s*(0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)\s*문제\s*$/.exec(
    text,
  );
  if (!matched) throw new JungolError("account_summary_invalid");
  const value = Number(matched[1]?.replaceAll(",", ""));
  if (!Number.isSafeInteger(value) || value < 0)
    throw new JungolError("account_summary_invalid");
  return value;
};

type AccountPageSections = {
  readonly matchedValue: string | null;
  readonly solvedLinks: readonly {
    readonly href: string;
    readonly text: string;
  }[];
  readonly structureValid: boolean;
};

const readSections = async (page: Page): Promise<AccountPageSections> =>
  (async () => {
    const matched = page.getByText("맞은 문제", { exact: true });
    const solved = page.getByText("해결한 문제", { exact: true });
    if ((await matched.count()) !== 1 || (await solved.count()) !== 1)
      return { matchedValue: null, solvedLinks: [], structureValid: false };
    const matchedRow = matched.locator("..");
    const solvedList = solved.locator("xpath=following-sibling::*[1]");
    if ((await solvedList.count()) !== 1)
      return { matchedValue: null, solvedLinks: [], structureValid: false };
    const matchedValue = (await matchedRow.innerText())
      .replace("맞은 문제", "")
      .trim();
    const solvedLinks = await solvedList.locator("a").evaluateAll((links) =>
      links.map((link) => ({
        href: link.getAttribute("href") ?? "",
        text: link.textContent?.trim() ?? "",
      })),
    );
    return { matchedValue, solvedLinks, structureValid: true };
  })();

const rejectChallenge = (text: string): void => {
  if (/captcha|challenge|verify you are human|자동화 방지/i.test(text))
    throw new JungolError("manual_recovery_required");
};

/** 계정 요약은 처음 한 번만 읽어 과거 제출·점수 재생 없이 해결 기준선을 만든다. */
export class AccountSummaryCollector {
  constructor(
    private readonly settings: BrowserSettings,
    private readonly requests: JungolRequestCoordinator,
    private readonly pages = new PageOperation(),
    private readonly login = new LoginStateDetector(),
  ) {}

  collect(
    page: Page,
    plan: AccountSyncPlan,
    signal?: AbortSignal,
  ): Promise<readonly InitialSolvedProblem[]> {
    if (
      plan.mode !== "initial_summary" ||
      plan.cursorBefore !== 0n ||
      plan.maxPages !== 1
    )
      return Promise.reject(new JungolError("invalid_plan"));
    return this.pages.run(page, signal, async () => {
      const response = await this.requests.schedule(
        "account_summary",
        signal,
        () =>
          page.goto(
            new URL(`/account/${plan.member.accountId}`, this.settings.baseUrl)
              .href,
            {
              waitUntil: "domcontentloaded",
              timeout: this.settings.pageTimeoutMs,
            },
          ),
      );
      if (!response?.ok()) throw new JungolError("account_summary_http_failed");
      if (
        this.login.needsLogin({
          url: page.url(),
          loginRequiredVisible: await page
            .getByText("로그인", { exact: true })
            .isVisible(),
        })
      )
        throw new JungolError("auth_required");
      rejectChallenge(await page.locator("body").innerText());
      const sections = await readSections(page);
      if (!sections.structureValid || sections.matchedValue === null)
        throw new JungolError("account_summary_invalid");
      const matched = count(sections.matchedValue);
      const ids = sections.solvedLinks.map((link) => {
        const href = /^\/problem\/([1-9][0-9]*)$/.exec(link.href);
        if (!href || link.text !== href[1])
          throw new JungolError("account_summary_invalid");
        return problemIdSchema.parse(Number(href[1]));
      });
      const distinct = new Set(ids);
      if (
        distinct.size !== ids.length ||
        matched !== ids.length ||
        matched !== plan.member.solvedCount
      )
        throw new JungolError("account_summary_mismatch");
      return ids.map((problemId) => new InitialSolvedProblem(problemId));
    });
  }
}
