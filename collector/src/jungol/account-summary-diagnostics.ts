import type { Page } from "playwright";
import type { SafeJungolDiagnostics } from "./errors.js";

type SummarySnapshot = {
  readonly profileSolvedCount: number | null;
  readonly observedLinkCount: number | null;
  readonly distinctLinkCount: number | null;
};

/** 원문 DOM 대신 수집 계약에 필요한 숫자만 timeout 알림 경계로 전달한다. */
export const accountSummaryTimeoutDiagnostics = async (
  page: Page,
  rankSolvedCount: number,
  timeoutMs: number,
): Promise<SafeJungolDiagnostics> => {
  const snapshot = await Promise.allSettled([
    page.evaluate((): SummarySnapshot => {
      const matchedLabels: Element[] = [];
      const solvedSections = new Set<Element>();
      for (const element of Array.from(document.querySelectorAll("*"))) {
        const text = element.textContent?.trim();
        if (text === "맞은 문제") {
          let childMatches = false;
          for (const child of Array.from(element.children)) {
            if (child.textContent?.trim() === text) childMatches = true;
          }
          if (!childMatches) matchedLabels.push(element);
        }
        if (/^(?:check\s*)?해결한 문제$/.test(text ?? "")) {
          const section = element.closest("section.card");
          if (section) solvedSections.add(section);
        }
      }
      const [matched] = matchedLabels;
      const profileText =
        matchedLabels.length === 1 && matched?.parentElement
          ? matched.parentElement.innerText.replace("맞은 문제", "").trim()
          : "";
      const profileMatch =
        /^\s*(0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)\s*문제\s*$/.exec(profileText);
      const [solved] = Array.from(solvedSections);
      const lists =
        solvedSections.size === 1 && solved
          ? Array.from(solved.querySelectorAll(".problem-list"))
          : [];
      const [list] = lists;
      const links =
        lists.length === 1 && list
          ? Array.from(list.querySelectorAll("a"))
          : [];
      const hrefs = new Set<string>();
      for (const link of links) {
        const href = link.getAttribute("href");
        if (href) hrefs.add(href);
      }
      return {
        profileSolvedCount: profileMatch
          ? Number(profileMatch[1]?.replaceAll(",", ""))
          : null,
        observedLinkCount: lists.length === 1 ? links.length : null,
        distinctLinkCount: lists.length === 1 ? hrefs.size : null,
      };
    }),
  ]);
  const result = snapshot[0];
  const values = result?.status === "fulfilled" ? result.value : undefined;
  return {
    stage: "account_summary_readiness",
    reason: "timeout",
    rankSolvedCount,
    profileSolvedCount: values?.profileSolvedCount ?? undefined,
    observedLinkCount: values?.observedLinkCount ?? undefined,
    distinctLinkCount: values?.distinctLinkCount ?? undefined,
    expectedCount: rankSolvedCount,
    timeoutMs,
  };
};
