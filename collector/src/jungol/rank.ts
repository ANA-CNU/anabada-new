import type { Page } from "playwright";
import { z } from "zod";
import { type RankMember, rankMemberSchema } from "../domain/sync.js";
import { AcRatingTierMapper } from "../scoring/tier.js";
import { JungolError } from "./errors.js";
import { type BrowserSettings, PageOperation } from "./page.js";

const countSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/)
  .transform((value) => Number(value.replaceAll(",", "")));
const problemCountSchema = z
  .string()
  .trim()
  .regex(/문제$/)
  .transform((value) => value.slice(0, -2))
  .pipe(countSchema);
const headersSchema = z.tuple([
  z.literal("등수"),
  z.literal("계정"),
  z.literal("푼 문제"),
  z.literal("틀린 문제"),
  z.literal("스트릭"),
  z.literal("AC 레이팅"),
]);
/** Jungol rank 페이지를 메모리 입력으로만 읽으며 DB 순위 테이블 의미를 부여하지 않는다. */
export class RankCollector {
  constructor(
    private readonly settings: BrowserSettings,
    private readonly tiers = new AcRatingTierMapper(),
    private readonly pages = new PageOperation(),
  ) {}
  collect(
    page: Page,
    groupId: number,
    signal?: AbortSignal,
  ): Promise<readonly RankMember[]> {
    return this.pages.run(page, signal, async () => {
      await page.goto(
        new URL(`/group/${groupId}/rank`, this.settings.baseUrl).href,
        { waitUntil: "domcontentloaded", timeout: this.settings.pageTimeoutMs },
      );
      const table = page.getByRole("table").first();
      await table
        .locator("tr")
        .nth(1)
        .waitFor({ state: "visible", timeout: this.settings.pageTimeoutMs });
      const headers = await table.locator("th").allTextContents();
      if (
        !headersSchema.safeParse(headers.map((header) => header.trim())).success
      )
        throw new JungolError("invalid_rank");
      const members: RankMember[] = [];
      const seen = new Set<string>();
      for (const row of (await table.locator("tr").all()).slice(1)) {
        const cells = await row.locator("td").allTextContents();
        if (cells.length !== 6) throw new JungolError("invalid_rank");
        const href = await row
          .locator('a[href*="/account/"]')
          .first()
          .getAttribute("href");
        const acRating = countSchema.safeParse(cells[5]).data;
        const parsed = rankMemberSchema.safeParse({
          accountId: href?.match(/\/account\/([1-9][0-9]*)(?:\/|$|\?)/)?.[1],
          jungolName: cells[1]?.trim().split(/\s+/)[0],
          solvedCount: problemCountSchema.safeParse(cells[2]).data,
          wrongCount: problemCountSchema.safeParse(cells[3]).data,
          acRating,
          tier:
            acRating === undefined ? undefined : this.tiers.toTier(acRating),
        });
        if (!parsed.success) throw new JungolError("invalid_rank");
        if (seen.has(parsed.data.accountId))
          throw new JungolError("duplicate_account");
        seen.add(parsed.data.accountId);
        members.push(parsed.data);
      }
      if (members.length === 0) throw new JungolError("invalid_rank");
      return members;
    });
  }
}
