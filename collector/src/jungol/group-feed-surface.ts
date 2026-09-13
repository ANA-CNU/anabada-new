import type { Locator, Page } from "playwright";
import { JungolError, rejectJungolHttpStatus } from "./errors.js";
import type { BrowserSettings } from "./page.js";

const path = "/group/1125/submission";
const headers = [
  "번호",
  "제출자",
  "문제",
  "결과",
  "시간",
  "메모리",
  "길이",
  "언어",
  "시각",
] as const;

/** Jungol 그룹 제출 표의 URL·인증·행 식별·pagination DOM 계약을 보관한다. */
export class GroupFeedSurface {
  constructor(private readonly settings: BrowserSettings) {}
  async isFeedPage(page: Page): Promise<boolean> {
    return (await this.isAcUrl(page)) && (await this.hasHeaders(page));
  }
  async navigate(page: Page): Promise<void> {
    const response = await page.goto(
      new URL(`${path}?result=AC`, this.settings.baseUrl).href,
      { waitUntil: "domcontentloaded", timeout: this.settings.pageTimeoutMs },
    );
    rejectJungolHttpStatus(response?.status());
    if (!response?.ok()) throw new JungolError("submission_http_failed");
    await this.requireAccessible(page);
    if (!(await this.isAcUrl(page)))
      throw new JungolError("group_feed_filter_invalid");
  }
  async waitForRows(page: Page): Promise<void> {
    await page.waitForFunction(
      (expected) => {
        const table = document.querySelector("table");
        const actual = Array.from(table?.querySelectorAll("thead th") ?? [])
          .map((cell) => cell.textContent?.trim())
          .join("|");
        const rows = Array.from(table?.querySelectorAll("tbody tr") ?? []);
        return (
          actual === expected.join("|") &&
          rows.some((row) =>
            /[?&]sid=\d+(?:&|$)/.test(
              row.querySelector("td:last-child a")?.getAttribute("href") ?? "",
            ),
          ) &&
          rows.every((row) => {
            const cells = row.querySelectorAll(":scope > td");
            const hrefs = Array.from(
              row.querySelectorAll("a"),
              (anchor) => anchor.getAttribute("href") ?? "",
            );
            const hasSid = /[?&]sid=\d+(?:&|$)/.test(
              cells[cells.length - 1]
                ?.querySelector("a")
                ?.getAttribute("href") ?? "",
            );
            if (
              cells.length === 1 &&
              !hrefs.some((href) =>
                /[?&]sid=\d+(?:&|$)|\/account\/\d+|\/problem\/\d+/.test(href),
              )
            )
              return true;
            return (
              cells.length === 9 &&
              hasSid &&
              /\/account\/\d+(?:$|[?#])/.test(
                cells[1]?.querySelector("a")?.getAttribute("href") ?? "",
              ) &&
              /\/problem\/\d+(?:$|[?#])/.test(
                cells[2]?.querySelector("a")?.getAttribute("href") ?? "",
              )
            );
          })
        );
      },
      [...headers],
      { timeout: this.settings.pageTimeoutMs },
    );
  }
  async requireAccessible(page: Page): Promise<void> {
    if (page.url().includes("/auth/signin"))
      throw new JungolError("auth_required");
    const challenge =
      /\/cdn-cgi\/challenge|\/captcha(?:\/|$)|\/challenge(?:\/|$)/i.test(
        new URL(page.url()).pathname,
      ) ||
      (await page
        .locator(
          '.g-recaptcha, .h-captcha, .cf-turnstile, #challenge-form, #challenge-running, iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"]',
        )
        .evaluateAll((items) =>
          items.some(
            (item) =>
              item.getClientRects().length > 0 &&
              getComputedStyle(item).visibility !== "hidden",
          ),
        ));
    const text = await page
      .getByText(
        /verify (?:that )?you are human|checking your browser|performing security verification|사람인지 확인|로봇이 아닙니다/i,
      )
      .first()
      .isVisible();
    if (challenge || text) throw new JungolError("manual_recovery_required");
  }
  async rowsBelow(
    page: Page,
    marker: string | null,
  ): Promise<readonly Locator[]> {
    const rows = await this.dataRows(page);
    if (marker === null) return rows;
    const result: Locator[] = [];
    for (const row of rows) {
      const id = await this.id(row);
      if (id !== null && BigInt(id) < BigInt(marker)) result.push(row);
    }
    return result;
  }
  async ids(page: Page): Promise<readonly string[]> {
    const result: string[] = [];
    for (const row of await this.dataRows(page)) {
      const id = await this.id(row);
      if (id !== null) result.push(id);
    }
    return result;
  }
  async clickMore(page: Page): Promise<void> {
    await page
      .getByRole("button", { name: "더 불러오기", exact: true })
      .click({ timeout: this.settings.pageTimeoutMs });
  }
  async waitForGrowth(page: Page, before: string): Promise<void> {
    await page.waitForFunction(
      (seen) =>
        Array.from(document.querySelectorAll("table tbody tr")).some((row) => {
          const href =
            row.querySelector("td:last-child a")?.getAttribute("href") ?? "";
          const id = new URL(href, location.href).searchParams.get("sid");
          return id !== null && !seen.split("|").includes(id);
        }),
      before,
      { timeout: this.settings.pageTimeoutMs },
    );
  }
  async settledMore(page: Page): Promise<boolean> {
    const button = page.getByRole("button", {
      name: "더 불러오기",
      exact: true,
    });
    await page.waitForFunction(
      () => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (item) => item.textContent?.trim() === "더 불러오기",
        );
        const loading = /로드 중|로딩 중|loading/i.test(
          document.body.innerText,
        );
        return button === undefined
          ? !loading
          : !button.disabled &&
              button.getAttribute("aria-busy") !== "true" &&
              !loading;
      },
      undefined,
      { timeout: this.settings.pageTimeoutMs },
    );
    return (await button.count()) === 1 && (await button.isVisible());
  }
  private async isAcUrl(page: Page): Promise<boolean> {
    const url = new URL(page.url());
    return (
      url.origin === new URL(this.settings.baseUrl).origin &&
      url.pathname === path &&
      url.searchParams.get("result") === "AC"
    );
  }
  private async hasHeaders(page: Page): Promise<boolean> {
    return (
      (
        await page
          .getByRole("table")
          .first()
          .locator("thead th")
          .allTextContents()
      )
        .map((value) => value.trim())
        .join("|") === headers.join("|")
    );
  }
  private async id(row: Locator): Promise<string | null> {
    const href = await row
      .locator("td")
      .last()
      .locator("a")
      .first()
      .getAttribute("href");
    return href === null
      ? null
      : new URL(href, this.settings.baseUrl).searchParams.get("sid");
  }
  private async dataRows(page: Page): Promise<readonly Locator[]> {
    const dataRows: Locator[] = [];
    for (const row of await page
      .getByRole("table")
      .first()
      .locator("tbody tr")
      .all()) {
      const cells = row.locator(":scope > td");
      const cellCount = await cells.count();
      const hrefs = await row
        .locator("a")
        .evaluateAll((anchors) =>
          anchors.map((anchor) => anchor.getAttribute("href") ?? ""),
        );
      const hasSubmission = hrefs.some((href) =>
        /[?&]sid=\d+(?:&|$)/.test(href),
      );
      const hasAccount = hrefs.some((href) =>
        /\/account\/\d+(?:$|[?#])/.test(href),
      );
      const hasProblem = hrefs.some((href) =>
        /\/problem\/\d+(?:$|[?#])/.test(href),
      );
      if (cellCount === 1 && !hasSubmission && !hasAccount && !hasProblem)
        continue;
      if (cellCount !== 9 || !hasSubmission || !hasAccount || !hasProblem)
        throw new JungolError("group_feed_row_invalid", {
          stage: "group_feed_rows_parse",
          reason: "partial_row",
          cellCount,
          hasSubmissionSid: hasSubmission,
          rowVisible: await row.isVisible(),
        });
      dataRows.push(row);
    }
    return dataRows;
  }
}
