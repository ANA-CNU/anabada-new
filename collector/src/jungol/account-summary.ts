import { errors, type Page } from "playwright";
import { type AccountSyncPlan, InitialSolvedProblem } from "../domain/sync.js";
import { problemIdSchema } from "../domain.js";
import { accountSummaryTimeoutDiagnostics } from "./account-summary-diagnostics.js";
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

const solvedTitle = /^(?:check\s*)?해결한 문제$/;

const readSections = async (page: Page): Promise<AccountPageSections> =>
  (async () => {
    const matched = page.getByText("맞은 문제", { exact: true });
    const solved = page.getByText(solvedTitle, { exact: true });
    if ((await matched.count()) !== 1)
      return { matchedValue: null, solvedLinks: [], structureValid: false };
    const matchedRow = matched.locator("..");
    const matchedValue = (await matchedRow.innerText())
      .replace("맞은 문제", "")
      .trim();
    const solvedCount = await solved.count();
    // rank와 화면의 맞은 문제 모두 0일 때만 solved card 자체가 없는 공개 빈 상태를 허용한다.
    if (count(matchedValue) === 0 && solvedCount === 0)
      return { matchedValue, solvedLinks: [], structureValid: true };
    if (solvedCount !== 1)
      return { matchedValue: null, solvedLinks: [], structureValid: false };
    const solvedSection = solved.locator(
      "xpath=ancestor::section[contains(concat(' ', normalize-space(@class), ' '), ' card ')][1]",
    );
    if ((await solvedSection.count()) !== 1)
      return { matchedValue: null, solvedLinks: [], structureValid: false };
    const solvedList = solvedSection.locator(".problem-list");
    if ((await solvedList.count()) !== 1)
      return { matchedValue: null, solvedLinks: [], structureValid: false };
    const solvedLinks = await solvedList.locator("a").evaluateAll((links) =>
      links.map((link) => ({
        href: link.getAttribute("href") ?? "",
        text: link.textContent?.trim() ?? "",
      })),
    );
    return { matchedValue, solvedLinks, structureValid: true };
  })();

/** 계정 요약은 처음 한 번만 읽어 과거 제출·점수 재생 없이 해결 기준선을 만든다. */
export class AccountSummaryCollector {
  constructor(
    private readonly settings: BrowserSettings,
    private readonly requests: JungolRequestCoordinator,
    private readonly pages = new PageOperation(),
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
    return this.pages.run(page, signal, () =>
      this.requests.schedule("account_summary", signal, async () => {
        const response = await page.goto(
          new URL(`/account/${plan.member.accountId}`, this.settings.baseUrl)
            .href,
          {
            waitUntil: "domcontentloaded",
            timeout: this.settings.pageTimeoutMs,
          },
        );
        if (!response?.ok())
          throw new JungolError("account_summary_http_failed", {
            stage: "account_summary",
            reason: "http",
            httpStatus: response?.status(),
            rankSolvedCount: plan.member.solvedCount,
          });
        await this.waitForCompleteSections(page, plan, signal);
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
          throw new JungolError("account_summary_mismatch", {
            stage: "account_summary",
            reason: "mismatch",
            rankSolvedCount: plan.member.solvedCount,
            profileSolvedCount: matched,
            observedLinkCount: ids.length,
            distinctLinkCount: distinct.size,
            expectedCount: plan.member.solvedCount,
          });
        return ids.map((problemId) => new InitialSolvedProblem(problemId));
      }),
    );
  }

  private async waitForCompleteSections(
    page: Page,
    plan: AccountSyncPlan,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    try {
      const readinessHandle = await page.waitForFunction(
        () => {
          const body = document.body.innerText;
          if (/captcha|challenge|verify you are human|자동화 방지/i.test(body))
            return "challenge";
          const matchedLabels: Element[] = [];
          const solvedSections = new Set<Element>();
          let loginVisible = false;
          for (const element of Array.from(document.querySelectorAll("*"))) {
            const text = element.textContent?.trim();
            if (
              element.getClientRects().length === 0 ||
              ["hidden", "collapse"].includes(
                getComputedStyle(element).visibility,
              ) ||
              (text !== "로그인" && text !== "맞은 문제")
            )
              continue;
            let childMatches = false;
            for (const child of Array.from(element.children)) {
              if (child.textContent?.trim() === text) childMatches = true;
            }
            if (childMatches) continue;
            if (text === "로그인") loginVisible = true;
            if (text === "맞은 문제") matchedLabels.push(element);
          }
          for (const element of Array.from(document.querySelectorAll("*"))) {
            if (
              !/^(?:check\s*)?해결한 문제$/.test(
                element.textContent?.trim() ?? "",
              )
            )
              continue;
            const section = element.closest("section.card");
            if (section) solvedSections.add(section);
          }
          if (location.pathname.includes("/auth/signin") || loginVisible)
            return "auth";
          const [matched] = matchedLabels;
          const [solved] = Array.from(solvedSections);
          if (!matched || matchedLabels.length !== 1) return false;
          const matchedRow = matched.parentElement;
          if (!matchedRow) return false;
          const count =
            /^\s*(0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)\s*문제\s*$/.exec(
              matchedRow.innerText.replace("맞은 문제", "").trim(),
            );
          if (!count) return false;
          const solvedCount = Number(count[1]?.replaceAll(",", ""));
          if (!Number.isSafeInteger(solvedCount) || solvedCount < 0)
            return false;
          if (solvedCount === 0 && solvedSections.size === 0) return "ready";
          if (!solved || solvedSections.size !== 1) return false;
          const solvedLists = Array.from(
            solved.querySelectorAll(".problem-list"),
          );
          const [solvedList] = solvedLists;
          if (solvedLists.length !== 1 || !solvedList) return false;
          const links = Array.from(solvedList.querySelectorAll("a"));
          if (links.length !== solvedCount) return false;
          for (const link of links) {
            const href = /^\/problem\/([1-9][0-9]*)$/.exec(
              link.getAttribute("href") ?? "",
            );
            if (href?.[1] !== link.textContent?.trim()) return false;
          }
          return "ready";
        },
        undefined,
        { timeout: this.settings.pageTimeoutMs },
      );
      let readiness: unknown;
      try {
        readiness = await readinessHandle.jsonValue();
      } finally {
        await readinessHandle.dispose();
      }
      if (readiness === "challenge")
        throw new JungolError("manual_recovery_required");
      if (readiness === "auth") throw new JungolError("auth_required");
      if (readiness !== "ready")
        throw new JungolError("account_summary_invalid");
    } catch (error) {
      if (signal?.aborted) throw new JungolError("cancelled");
      if (error instanceof errors.TimeoutError)
        throw new JungolError(
          "account_summary_invalid",
          await accountSummaryTimeoutDiagnostics(
            page,
            plan.member.solvedCount,
            this.settings.pageTimeoutMs,
          ),
        );
      throw error;
    }
  }
}
