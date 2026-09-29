import { errors, type Page } from "playwright";
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
      if (
        await page
          .getByText("비공개 프로필이에요", { exact: true })
          .first()
          .isVisible()
      )
        throw new JungolError("account_summary_invalid");
      let stateHandle: Awaited<ReturnType<typeof page.waitForFunction>>;
      try {
        stateHandle = await page.waitForFunction(
          () => {
            const rows = Array.from(document.querySelectorAll(".jgacc-row"));
            const solvedRows = rows.filter((row) =>
              /^해결한 문제\s*(0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)\s*문제$/.test(
                row.textContent?.trim() ?? "",
              ),
            );
            const count =
              /^해결한 문제\s*(0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)\s*문제$/.exec(
                solvedRows[0]?.textContent?.trim() ?? "",
              );
            const sections = Array.from(
              document.querySelectorAll("section.jgacc-sec"),
            );
            const section = sections.find(
              (candidate) =>
                candidate
                  .querySelector("h2.jgacc-sec-title")
                  ?.textContent?.trim() === "해결한 문제",
            );
            if (solvedRows.length !== 1 || !count) return false;
            const advertised = Number(count[1]?.replaceAll(",", ""));
            if (advertised === 0 && !section)
              return { advertised, observed: 0 };
            if (!section) return false;
            const observed = section.querySelectorAll(
              'a[href*="/problem/"]',
            ).length;
            return {
              advertised,
              observed,
            };
          },
          undefined,
          { timeout: this.settings.pageTimeoutMs },
        );
      } catch (error) {
        if (
          error instanceof errors.TimeoutError &&
          (await page
            .getByText("비공개 프로필이에요", { exact: true })
            .first()
            .isVisible())
        )
          throw new JungolError("account_summary_invalid");
        throw error;
      }
      const initial = profileStateSchema.parse(await stateHandle.jsonValue());
      await stateHandle.dispose();
      if (initial.advertised === 0) return [];
      const section = page.locator("section.jgacc-sec").filter({
        has: page.locator("h2.jgacc-sec-title", {
          hasText: "해결한 문제",
        }),
      });
      for (let clicks = 0; clicks < 100; clicks += 1) {
        const observed = await section.locator('a[href*="/problem/"]').count();
        if (observed === initial.advertised) break;
        const expand = section
          .locator('button.jgacc-tiergroup-head[aria-expanded="false"]')
          .first();
        const collapsed = await section
          .locator('button.jgacc-tiergroup-head[aria-expanded="false"]')
          .count();
        if (collapsed === 0) throw new JungolError("account_summary_invalid");
        await this.requests.schedule("account_summary", signal, async () => {
          await expand.click({ timeout: this.settings.pageTimeoutMs });
          await page.waitForFunction(
            ({ previous, advertised }) => {
              const solved = Array.from(
                document.querySelectorAll("section.jgacc-sec"),
              ).find(
                (candidate) =>
                  candidate
                    .querySelector("h2.jgacc-sec-title")
                    ?.textContent?.trim() === "해결한 문제",
              );
              const expanded = solved?.querySelector(
                'button.jgacc-tiergroup-head[aria-expanded="true"]',
              );
              const next =
                solved?.querySelectorAll('a[href*="/problem/"]').length ?? 0;
              return (
                expanded !== null &&
                expanded !== undefined &&
                (next > previous || next === advertised)
              );
            },
            { previous: observed, advertised: initial.advertised },
            { timeout: this.settings.pageTimeoutMs },
          );
        });
      }
      const links = await section
        .locator('a[href*="/problem/"]')
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
