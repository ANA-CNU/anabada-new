import type { Locator, Page } from "playwright";
import { JungolError, rejectJungolHttpStatus } from "./errors.js";
import { inspectGroupFeedTable } from "./group-feed-table.js";
import type { BrowserSettings } from "./page.js";
import {
  SubmissionIdExtractionError,
  submissionIdFromHrefs,
} from "./submission-id.js";

const path = "/group/1125/submission";
const acceptedResult = /^정답(?:\s+\d+\s*점)?$/;

/** Jungol 그룹 제출 표의 URL·인증·행 식별·pagination DOM 계약을 보관한다. */
export class GroupFeedSurface {
  constructor(private readonly settings: BrowserSettings) {}
  async isFeedPage(page: Page): Promise<boolean> {
    if (!(await this.isAcUrl(page))) return false;
    const columns = await page.evaluate(
      inspectGroupFeedTable,
      "headers" as const,
    );
    return (
      columns !== null &&
      columns !== "boundary" &&
      (await this.hasAcceptedRows(page, columns.result))
    );
  }
  async navigate(page: Page): Promise<void> {
    const response = await page.goto(
      new URL(path, this.settings.baseUrl).href,
      { waitUntil: "domcontentloaded", timeout: this.settings.pageTimeoutMs },
    );
    rejectJungolHttpStatus(response?.status());
    if (!response?.ok()) throw new JungolError("submission_http_failed");
    await this.requireAccessible(page);
  }
  async applyAcceptedFilter(page: Page): Promise<void> {
    await this.requireAccessible(page);
    await page
      .getByRole("button", { name: "결과", exact: true })
      .click({ timeout: this.settings.pageTimeoutMs });
    await page
      .getByRole("option", { name: "정답", exact: true })
      .click({ timeout: this.settings.pageTimeoutMs });
    await page.waitForFunction(
      (target) => {
        const url = new URL(location.href);
        return (
          url.pathname === target.path &&
          url.searchParams.get("result") === "AC"
        );
      },
      { path },
      { timeout: this.settings.pageTimeoutMs },
    );
    await this.requireAccessible(page);
  }
  async waitForRows(page: Page): Promise<void> {
    await page.waitForFunction(inspectGroupFeedTable, "ready" as const, {
      timeout: this.settings.pageTimeoutMs,
    });
    await this.requireAccessible(page);
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
    if (
      await page
        .getByText(/^문제가 발생했어요(?:\s|:|$)/)
        .first()
        .isVisible()
    )
      throw new JungolError("group_feed_navigation_failed", {
        stage: "group_feed_navigation",
        reason: "mismatch",
      });
  }
  async rowsBelow(
    page: Page,
    marker: string | null,
  ): Promise<readonly Locator[]> {
    const rows = await this.dataRows(page);
    if (marker === null) return rows;
    const result: Locator[] = [];
    for (const row of rows) {
      const id = await this.id(row, page.url());
      if (BigInt(id) < BigInt(marker)) result.push(row);
    }
    return result;
  }
  async ids(page: Page): Promise<readonly string[]> {
    const result: string[] = [];
    for (const row of await this.dataRows(page))
      result.push(await this.id(row, page.url()));
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
          const id = Array.from(row.querySelectorAll("a[href]")).find(
            (anchor) => {
              const href = anchor.getAttribute("href");
              return (
                href !== null &&
                new URL(href, location.href).searchParams.has("sid")
              );
            },
          );
          const href = id?.getAttribute("href");
          const sid =
            href === null || href === undefined
              ? null
              : new URL(href, location.href).searchParams.get("sid");
          return sid !== null && !seen.split("|").includes(sid);
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
  private async hasAcceptedRows(
    page: Page,
    resultIndex: number,
  ): Promise<boolean> {
    const rows = await this.dataRows(page);
    if (rows.length === 0) return false;
    for (const row of rows) {
      const result = await row
        .locator(":scope > td")
        .nth(resultIndex)
        .textContent();
      if (!acceptedResult.test(result?.trim() ?? "")) return false;
    }
    return true;
  }
  private async id(row: Locator, documentBaseUrl: string): Promise<string> {
    try {
      return submissionIdFromHrefs(await this.hrefs(row), documentBaseUrl);
    } catch (error) {
      if (!(error instanceof SubmissionIdExtractionError)) throw error;
      throw new JungolError("group_feed_row_invalid", {
        stage: "group_feed_rows_parse",
        reason: "mismatch",
        hasSubmissionSid: error.code !== "submission_id_missing",
        rowVisible: await row.isVisible(),
      });
    }
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
      const hrefs = await this.hrefs(row);
      const hasSubmission = hrefs.some((href) => href.includes("sid="));
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
      await this.id(row, page.url());
      dataRows.push(row);
    }
    return dataRows;
  }

  private async hrefs(row: Locator): Promise<readonly string[]> {
    return row
      .locator("a")
      .evaluateAll((anchors) =>
        anchors.map((anchor) => anchor.getAttribute("href") ?? ""),
      );
  }
}
