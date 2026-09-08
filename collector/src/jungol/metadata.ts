import type { Page } from "playwright";
import { z } from "zod";
import type { ProblemId } from "../domain.js";
import { JungolError, rejectJungolHttpStatus } from "./errors.js";
import { type BrowserSettings, PageOperation } from "./page.js";
import type { JungolRequestCoordinator } from "./request-coordinator.js";

export type ProblemMetadata = {
  readonly problemId: ProblemId;
  readonly title: string | null;
  readonly tier: number;
};
const metadataSchema = z
  .object({
    title: z.string().trim().min(1).max(512),
    tier: z.coerce.number().int().min(0).max(31),
  })
  .readonly();
/** AC 문제만 보강하고 조회 불능은 제목 NULL·난이도 0이라는 명시적 fallback으로 바꾼다. */
export class ProblemMetadataResolver {
  private readonly cache = new Map<ProblemId, ProblemMetadata>();
  constructor(
    private readonly settings: BrowserSettings,
    private readonly requests: JungolRequestCoordinator,
    private readonly pages = new PageOperation(),
  ) {}
  clearCycle(): void {
    this.cache.clear();
  }
  async resolve(
    page: Page,
    problemId: ProblemId,
    signal?: AbortSignal,
  ): Promise<ProblemMetadata> {
    if (signal?.aborted) throw new JungolError("cancelled");
    const cached = this.cache.get(problemId);
    if (cached) return cached;
    const fallback = { problemId, title: null, tier: 0 };
    let result: ProblemMetadata;
    try {
      result = await this.pages.run(page, signal, async () => {
        const response = await this.requests.schedule(
          "problem_metadata",
          signal,
          async () =>
            page.goto(
              new URL(`/problem/${problemId}`, this.settings.baseUrl).href,
              {
                waitUntil: "domcontentloaded",
                timeout: this.settings.pageTimeoutMs,
              },
            ),
        );
        rejectJungolHttpStatus(response?.status());
        if (!response?.ok()) return fallback;
        const raw = await page.evaluate(() => ({
          title: document.querySelector("[data-problem-title], h1")
            ?.textContent,
          tier:
            document.querySelector("[data-tier]")?.getAttribute("data-tier") ??
            0,
        }));
        const parsed = metadataSchema.safeParse(raw);
        return parsed.success ? { problemId, ...parsed.data } : fallback;
      });
    } catch (error) {
      if (error instanceof JungolError && error.code === "browser_failed")
        result = fallback;
      else throw error;
    }
    this.cache.set(problemId, result);
    return result;
  }
}
