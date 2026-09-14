import type { Locator, Page } from "playwright";
import { sourceLocationFrom } from "../application/safe-source-location.js";
import { accountIdSchema, type GroupMemberSnapshot } from "../domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../domain.js";
import type { GroupAcceptedSubmission } from "../group-domain.js";
import { JungolError } from "./errors.js";
import type {
  SubmissionTimestamp,
  SubmissionTimestampReader,
} from "./submission-timestamp.js";

/** 검증된 그룹 제출 행을 account·problem·sid·hover 시각을 갖는 저장 입력으로 변환한다. */
export class GroupSubmissionDomParser {
  constructor(private readonly timestamps: SubmissionTimestampReader) {}

  async parse(
    page: Page,
    rows: readonly Locator[],
    members: readonly GroupMemberSnapshot[],
  ): Promise<readonly GroupAcceptedSubmission[]> {
    const memberIds = new Set(members.map((member) => member.accountId));
    const submissions: GroupAcceptedSubmission[] = [];
    for (const [rowIndex, row] of rows.entries()) {
      const cells = row.locator(":scope > td");
      const cellCount = await cells.count();
      const descendantCellCount = await row.locator("td").count();
      if (cellCount !== 9)
        throw new JungolError("group_feed_row_invalid", {
          stage: "group_feed_rows_parse",
          reason: "partial_row",
          cellCount,
          descendantCellCount,
          rowIndex,
          hasSubmissionSid: await row
            .locator("a")
            .evaluateAll((anchors) =>
              anchors.some((anchor) =>
                /[?&]sid=\d+(?:&|$)/.test(anchor.getAttribute("href") ?? ""),
              ),
            ),
          rowVisible: await row.isVisible(),
        });
      const accountId = accountIdSchema.parse(
        await this.idFrom(cells.nth(1), "account"),
      );
      const problemId = problemIdSchema.parse(
        Number(await this.idFrom(cells.nth(2), "problem")),
      );
      const submissionId = submissionIdSchema.parse(
        await this.idFrom(cells.last(), "sid"),
      );
      if (!memberIds.has(accountId)) {
        const location = sourceLocationFrom(
          new Error("group_feed_actor_unmatched"),
          "GroupSubmissionDomParser.parse",
        );
        throw new JungolError("group_feed_actor_unmatched", {
          stage: "group_feed_actor_resolution",
          reason: "mismatch",
          lastSubmissionId: submissionId,
          observedAccountId: accountId,
          problemId,
          expectedCount: members.length,
          ...(location === undefined ? {} : { location }),
        });
      }
      if (!/정답/.test((await cells.nth(3).textContent()) ?? ""))
        throw new JungolError("group_feed_row_invalid");
      const score = this.score((await cells.nth(3).textContent()) ?? "");
      let timestamp: SubmissionTimestamp;
      try {
        timestamp = await this.timestamps.read(page, row);
      } catch (error) {
        if (!(error instanceof JungolError) || !error.diagnostics) throw error;
        throw new JungolError(error.code, {
          ...error.diagnostics,
          problemId,
          lastSubmissionId: submissionId,
        });
      }
      submissions.push({
        accountId,
        submissionId,
        problemId,
        submittedAt: timestamp.submittedAt,
        score,
      });
    }
    return submissions;
  }

  private async idFrom(cell: Locator, key: string): Promise<string> {
    const href = await cell.locator("a").first().getAttribute("href");
    if (!href) throw new JungolError("group_feed_row_invalid");
    const url = new URL(href, "https://jungol.co.kr");
    const fromPath = new RegExp(`/${key === "sid" ? "" : key}/(\\d+)$`).exec(
      url.pathname,
    )?.[1];
    const value = key === "sid" ? url.searchParams.get("sid") : fromPath;
    if (!value) throw new JungolError("group_feed_row_invalid");
    return value;
  }

  private score(text: string): number | null {
    const matched = /정답\s+(\d+)점/.exec(text);
    return matched ? Number(matched[1]) : null;
  }
}
