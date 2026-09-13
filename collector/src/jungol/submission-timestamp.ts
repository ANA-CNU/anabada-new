import { errors, type Locator, type Page } from "playwright";
import { sourceLocationFrom } from "../application/safe-source-location.js";
import { JungolError } from "./errors.js";

const koreanAbsoluteTimestamp =
  /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2}):(\d{2})$/;

const koreaOffsetMilliseconds = 9 * 60 * 60 * 1000;

/** 한국어 KST 절대시각만 UTC로 변환하고 상대 시각의 날짜 추정을 거부한다. */
export class SubmissionTimestampParser {
  /** Jungol의 한국 표준시 절대시각만 UTC로 변환하고 상대 날짜 추정을 거부한다. */
  parse(text: string): Date {
    const matched = koreanAbsoluteTimestamp.exec(text.trim());
    if (!matched)
      throw new JungolError("group_feed_timestamp_parse_failed", {
        stage: "group_feed_timestamp_parse",
        reason: "missing_timestamp",
      });
    const [
      ,
      yearText,
      monthText,
      dayText,
      meridiem,
      hourText,
      minuteText,
      secondText,
    ] = matched;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour12 = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      hour12 < 1 ||
      hour12 > 12 ||
      minute > 59 ||
      second > 59
    )
      throw new JungolError("group_feed_timestamp_parse_failed", {
        stage: "group_feed_timestamp_parse",
        reason: "missing_timestamp",
      });
    const hour = (hour12 % 12) + (meridiem === "오후" ? 12 : 0);
    const result = new Date(
      Date.UTC(year, month - 1, day, hour, minute, second) -
        koreaOffsetMilliseconds,
    );
    const local = new Date(result.getTime() + koreaOffsetMilliseconds);
    if (
      local.getUTCFullYear() !== year ||
      local.getUTCMonth() !== month - 1 ||
      local.getUTCDate() !== day ||
      local.getUTCHours() !== hour ||
      local.getUTCMinutes() !== minute ||
      local.getUTCSeconds() !== second
    )
      throw new JungolError("group_feed_timestamp_parse_failed", {
        stage: "group_feed_timestamp_parse",
        reason: "missing_timestamp",
      });
    return result;
  }
}

export type SubmissionTimestamp = {
  readonly raw: string;
  readonly submittedAt: Date;
};

/** 이전 tooltip을 숨긴 뒤 현재 제출 행을 hover해 그 행에 연결된 정확한 시각만 읽는다. */
export class SubmissionTimestampReader {
  private readonly exactTimestamp = new RegExp(koreanAbsoluteTimestamp.source);

  constructor(
    private readonly timeoutMs: number,
    private readonly parser = new SubmissionTimestampParser(),
  ) {}

  /** 이전 tooltip이 숨은 뒤 현재 행의 time wrapper가 연 정확한 tooltip만 반환한다. */
  async read(page: Page, row: Locator): Promise<SubmissionTimestamp> {
    const trigger = row
      .locator("td")
      .last()
      .locator('[role="button"][tabindex="0"]')
      .first();
    try {
      await page.mouse.move(0, 0);
      await this.waitForVisibleTimestampCount(page, 0);
      await trigger.hover({ timeout: this.timeoutMs });
      const timestamp = await this.waitForVisibleTimestamp(page);
      return { raw: timestamp, submittedAt: this.parser.parse(timestamp) };
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        const location = sourceLocationFrom(
          error,
          "SubmissionTimestampReader.read",
        );
        throw new JungolError("group_feed_timestamp_hover_failed", {
          stage: "group_feed_timestamp_hover",
          reason: "timeout",
          timeoutMs: this.timeoutMs,
          originalErrorKind: "TimeoutError",
          ...(location === undefined ? {} : { location }),
        });
      }
      throw error;
    }
  }

  private async waitForVisibleTimestamp(page: Page): Promise<string> {
    await this.waitForVisibleTimestampCount(page, 1);
    const candidates = page.getByText(this.exactTimestamp, { exact: true });
    for (let index = 0; index < (await candidates.count()); index += 1) {
      const candidate = candidates.nth(index);
      if (await candidate.isVisible()) {
        const text = (await candidate.textContent())?.trim();
        if (text) return text;
      }
    }
    throw new JungolError("group_feed_timestamp_hover_failed", {
      stage: "group_feed_timestamp_hover",
      reason: "timeout",
      timeoutMs: this.timeoutMs,
    });
  }

  private async waitForVisibleTimestampCount(
    page: Page,
    expected: number,
  ): Promise<void> {
    await page.waitForFunction(
      ({ source, expectedVisible }) => {
        const expression = new RegExp(source);
        const matches = Array.from(document.querySelectorAll("body *")).filter(
          (element) =>
            expression.test((element.textContent ?? "").trim()) &&
            element.children.length === 0 &&
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility !== "hidden",
        );
        return matches.length === expectedVisible;
      },
      { source: this.exactTimestamp.source, expectedVisible: expected },
      { timeout: this.timeoutMs },
    );
  }
}
