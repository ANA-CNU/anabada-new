import type { Page } from "playwright";
import { z } from "zod";
import { type RankMember, rankMemberSchema } from "../domain/sync.js";
import { AcRatingTierMapper } from "../scoring/tier.js";
import { JungolError, rejectJungolHttpStatus } from "./errors.js";
import { type BrowserSettings, PageOperation } from "./page.js";
import type { JungolRequestCoordinator } from "./request-coordinator.js";

const countSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/)
  .transform((value) => Number(value.replaceAll(",", "")));
const acRatingSchema = z.string().trim().pipe(countSchema);
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
const unavailableAccountLabels = new Set([
  "로드 중...",
  "Loading...",
  "Cargando...",
  "読み込み中...",
  "加载中...",
  "載入中...",
  "Đang tải...",
  "Memuat...",
  "Chargement...",
  "Загрузка...",
  "Laden...",
  "탈퇴한 사용자",
  "Deleted user",
  "Usuario eliminado",
  "退会したユーザー",
  "已注销用户",
  "已註銷使用者",
  "Người dùng đã rút tiền",
  "Pengguna yang telah menarik diri",
  "Utilisateur qui s'est retiré",
  "Пользователь, вышедший из игры",
  "Benutzer, der sich zurückgezogen hat",
]);
/** Jungol rank 페이지를 메모리 입력으로만 읽으며 DB 순위 테이블 의미를 부여하지 않는다. */
export class RankCollector {
  constructor(
    private readonly settings: BrowserSettings,
    private readonly requests: JungolRequestCoordinator,
    private readonly tiers = new AcRatingTierMapper(),
    private readonly pages = new PageOperation(),
  ) {}
  collect(
    page: Page,
    groupId: number,
    signal?: AbortSignal,
  ): Promise<readonly RankMember[]> {
    return this.pages.run(page, signal, async () =>
      this.requests.schedule("rank_page", signal, async () => {
        const response = await page.goto(
          new URL(`/group/${groupId}/rank`, this.settings.baseUrl).href,
          {
            waitUntil: "domcontentloaded",
            timeout: this.settings.pageTimeoutMs,
          },
        );
        rejectJungolHttpStatus(response?.status());
        const table = page.getByRole("table").first();
        await table
          .locator("tr")
          .nth(1)
          .waitFor({ state: "visible", timeout: this.settings.pageTimeoutMs });
        const headers = await table.locator("th").allTextContents();
        if (
          !headersSchema.safeParse(headers.map((header) => header.trim()))
            .success
        )
          throw new JungolError("invalid_rank");
        const members: RankMember[] = [];
        const seen = new Set<string>();
        for (const row of (await table.locator("tr").all()).slice(1)) {
          const cells = await row.locator("td").allTextContents();
          if (cells.length !== 6) throw new JungolError("invalid_rank");
          const solvedCount = problemCountSchema.safeParse(cells[2]).data;
          const wrongCount = problemCountSchema.safeParse(cells[3]).data;
          const acRating = acRatingSchema.safeParse(cells[5]).data;
          if (
            solvedCount === undefined ||
            wrongCount === undefined ||
            acRating === undefined
          )
            throw new JungolError("invalid_rank");
          const accountLink = row.locator('a[href*="/account/"]').first();
          const href = await accountLink.getAttribute("href");
          const accountCell = row.locator("td").nth(1);
          const accountCellElement = await accountCell.elementHandle();
          if (!accountCellElement) throw new JungolError("invalid_rank");
          const resolvedHandle = await page.waitForFunction(
            ({ accountHref, cell, unavailable }) => {
              const chip = cell.querySelector(".chip");
              if (
                !(chip instanceof HTMLAnchorElement) ||
                chip.getAttribute("href") !== accountHref
              )
                return false;
              const handle = Array.from(chip?.childNodes ?? [])
                .filter((node) => node.nodeType === Node.TEXT_NODE)
                .map((node) => node.textContent ?? "")
                .join("")
                .trim();
              return handle.length > 0 && !unavailable.includes(handle)
                ? handle
                : false;
            },
            {
              accountHref: href,
              cell: accountCellElement,
              unavailable: [...unavailableAccountLabels],
            },
            { timeout: this.settings.pageTimeoutMs },
          );
          // 계정 chip의 직접 텍스트 노드가 handle이다. 자식 요소의 nickname/name은 저장하지 않는다.
          const jungolName = await resolvedHandle.jsonValue();
          const parsed = rankMemberSchema.safeParse({
            accountId: href?.match(/\/account\/([1-9][0-9]*)(?:\/|$|\?)/)?.[1],
            jungolName,
            solvedCount,
            wrongCount,
            acRating,
            tier: this.tiers.toTier(acRating),
          });
          if (!parsed.success) throw new JungolError("invalid_rank");
          if (seen.has(parsed.data.accountId))
            throw new JungolError("duplicate_account");
          seen.add(parsed.data.accountId);
          members.push(parsed.data);
        }
        if (members.length === 0) throw new JungolError("invalid_rank");
        return members;
      }),
    );
  }
}
