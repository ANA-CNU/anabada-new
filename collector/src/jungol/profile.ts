import type { Page } from "playwright";
import { z } from "zod";
import { type ProblemId, problemIdSchema } from "../domain.js";
import { JungolError } from "./errors.js";
import { type BrowserSettings, PageOperation } from "./page.js";
import type { JungolRequestCoordinator } from "./request-coordinator.js";

const profileStateSchema = z.object({
  advertised: z.number().int().nonnegative(),
  observed: z.number().int().nonnegative(),
});

/** 검증된 solved-card selector만 사용해 profile의 완전한 문제 목록을 읽는다. */
export class AccountProfileCollector {
  constructor(
    private readonly settings: BrowserSettings,
    private readonly requests: JungolRequestCoordinator,
    private readonly pages = new PageOperation(),
  ) {}

  collectSolved(
    page: Page,
    signal?: AbortSignal,
  ): Promise<readonly ProblemId[]> {
    return this.pages.run(page, signal, async () => {
      const stateHandle = await page.waitForFunction(
        () => {
          const labels = Array.from(document.querySelectorAll("*")).filter(
            (element) =>
              element.textContent?.trim() === "맞은 문제" &&
              !Array.from(element.children).some(
                (child) => child.textContent?.trim() === "맞은 문제",
              ),
          );
          const label = labels[0];
          const count =
            /^\s*(0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)\s*문제\s*$/.exec(
              label?.parentElement?.innerText.replace("맞은 문제", "") ?? "",
            );
          const title = Array.from(document.querySelectorAll("*")).find(
            (element) =>
              /^(?:check\s*)?해결한 문제$/.test(
                element.textContent?.trim() ?? "",
              ),
          );
          const section = title?.closest("section.card");
          const list = section?.querySelector(".problem-list");
          if (labels.length !== 1 || !count) return false;
          const advertised = Number(count[1]?.replaceAll(",", ""));
          if (advertised === 0 && !section) return { advertised, observed: 0 };
          if (!section || !list) return false;
          return {
            advertised,
            observed: list.querySelectorAll('a[href^="/problem/"]').length,
          };
        },
        undefined,
        { timeout: this.settings.pageTimeoutMs },
      );
      const initial = profileStateSchema.parse(await stateHandle.jsonValue());
      await stateHandle.dispose();
      if (initial.advertised === 0) return [];
      const section = page
        .getByText(/^(?:check\s*)?해결한 문제$/, { exact: true })
        .locator(
          "xpath=ancestor::section[contains(concat(' ', normalize-space(@class), ' '), ' card ')][1]",
        );
      for (let clicks = 0; clicks < 100; clicks += 1) {
        const observed = await section
          .locator('.problem-list a[href^="/problem/"]')
          .count();
        if (observed === initial.advertised) break;
        const expand = section
          .locator("button")
          .filter({ hasText: /^expand_more$/ });
        if ((await expand.count()) !== 1)
          throw new JungolError("account_summary_invalid");
        await this.requests.schedule(
          "submission_next_page",
          signal,
          async () => {
            await expand.click({ timeout: this.settings.pageTimeoutMs });
            await page.waitForFunction(
              ({ previous, advertised }) => {
                const title = Array.from(document.querySelectorAll("*")).find(
                  (element) =>
                    /^(?:check\s*)?해결한 문제$/.test(
                      element.textContent?.trim() ?? "",
                    ),
                );
                const next =
                  title
                    ?.closest("section.card")
                    ?.querySelectorAll('.problem-list a[href^="/problem/"]')
                    .length ?? 0;
                return next > previous || next === advertised;
              },
              { previous: observed, advertised: initial.advertised },
              { timeout: this.settings.pageTimeoutMs },
            );
          },
        );
      }
      const links = await section
        .locator('.problem-list a[href^="/problem/"]')
        .evaluateAll((items) =>
          items.map((item) => ({
            href: item.getAttribute("href") ?? "",
            text: item.textContent?.trim() ?? "",
          })),
        );
      if (links.length !== initial.advertised)
        throw new JungolError("account_summary_invalid");
      const ids = links.map((link) => {
        const matched = /^\/problem\/([1-9][0-9]*)$/.exec(link.href);
        if (!matched || matched[1] !== link.text)
          throw new JungolError("account_summary_invalid");
        return problemIdSchema.parse(Number(matched[1]));
      });
      if (new Set(ids).size !== ids.length)
        throw new JungolError("account_summary_invalid");
      return ids;
    });
  }
}
