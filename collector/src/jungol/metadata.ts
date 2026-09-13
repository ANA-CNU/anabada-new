import { errors, type Page, type Response } from "playwright";
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
/** 정상 로딩된 문제의 난이도를 읽으며 timeout은 추정값으로 숨기지 않는다. */
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
    let rejectedStatus: number | undefined;
    const observeResponse = (response: Response): void => {
      const url = new URL(response.url());
      if (
        url.origin === new URL(this.settings.baseUrl).origin &&
        url.pathname.startsWith("/api/") &&
        (response.status() === 403 || response.status() === 429)
      )
        rejectedStatus = response.status();
    };
    page.on("response", observeResponse);
    try {
      result = await this.pages.run(page, signal, async () => {
        const response = await this.requests.schedule(
          "problem_metadata",
          signal,
          async () => {
            const response = await page
              .goto(
                new URL(`/problem/${problemId}`, this.settings.baseUrl).href,
                {
                  waitUntil: "domcontentloaded",
                  timeout: this.settings.pageTimeoutMs,
                },
              )
              .catch((error: unknown) => {
                if (!(error instanceof errors.TimeoutError)) throw error;
                throw new JungolError("problem_metadata_timeout", {
                  stage: "problem_metadata_navigation",
                  reason: "timeout",
                  problemId,
                  timeoutMs: this.settings.pageTimeoutMs,
                });
              });
            rejectJungolHttpStatus(response?.status());
            if (!response?.ok())
              throw new JungolError("problem_metadata_http_failed", {
                stage: "status",
                reason: "http",
                problemId,
                httpStatus: response?.status(),
              });
            await this.requireAccessible(page, rejectedStatus);
            // HTML 도착과 metadata 준비는 다르다. tier 표시가 생기기 전에 0을 캐시하지 않는다.
            try {
              const handle = await page.waitForFunction(
                () => {
                  const title = document.querySelector(
                    "[data-problem-title], h1",
                  );
                  const tier = document.querySelector("[data-tier]");
                  const icon = title?.querySelector('img[src*="/solved/"]');
                  const statementReady = Array.from(
                    document.querySelectorAll("article h2"),
                  ).some(
                    (heading) =>
                      /^문제(?:\s|$)/.test(heading.textContent?.trim() ?? "") &&
                      !!heading.parentElement
                        ?.querySelector("p,pre,ul,ol,table")
                        ?.textContent?.trim(),
                  );
                  if (
                    !title?.textContent?.trim() ||
                    (!tier && !icon && !statementReady)
                  )
                    return false;
                  const imageTier = icon
                    ?.getAttribute("src")
                    ?.match(/\/solved\/(\d+)\.svg(?:\?|$)/)?.[1];
                  if (
                    icon &&
                    (imageTier === undefined || Number(imageTier) > 31)
                  )
                    return false;
                  return {
                    title: (title.matches("[data-problem-title]")
                      ? title.textContent
                      : (title.querySelector(":scope > span:not(.limit)")
                          ?.textContent ?? title.textContent)
                    )?.trim(),
                    tier: imageTier ?? tier?.getAttribute("data-tier") ?? 0,
                  };
                },
                undefined,
                { timeout: this.settings.pageTimeoutMs },
              );
              const raw: unknown = await handle.jsonValue();
              await handle.dispose();
              await this.requireAccessible(page, rejectedStatus);
              const parsed = metadataSchema.safeParse(raw);
              return parsed.success ? { problemId, ...parsed.data } : fallback;
            } catch (error) {
              if (!(error instanceof errors.TimeoutError)) throw error;
              await this.requireAccessible(page, rejectedStatus);
              const observed = await page.evaluate(() => {
                const title = document.querySelector(
                  "[data-problem-title], h1",
                );
                return {
                  titleObserved: !!title?.textContent?.trim(),
                  imageObserved: !!title?.querySelector('img[src*="/solved/"]'),
                };
              });
              throw new JungolError("problem_metadata_timeout", {
                stage: "problem_metadata_readiness",
                reason: "timeout",
                problemId,
                timeoutMs: this.settings.pageTimeoutMs,
                ...observed,
              });
            }
          },
        );
        return response;
      });
    } finally {
      page.off("response", observeResponse);
    }
    this.cache.set(problemId, result);
    return result;
  }

  private async requireAccessible(
    page: Page,
    rejectedStatus?: number,
  ): Promise<void> {
    rejectJungolHttpStatus(rejectedStatus);
    if (
      new URL(page.url()).pathname.includes("/auth/signin") ||
      (await page
        .getByText(/로그인이 필요해요|그룹에 가입해야 해요/)
        .first()
        .isVisible())
    )
      throw new JungolError("auth_required");
    const challenge = page
      .locator(
        "#challenge-form, #challenge-running, .cf-turnstile, .g-recaptcha, .h-captcha",
      )
      .first();
    if (
      (await challenge.isVisible()) ||
      (await page
        .getByText(
          /verify (?:that )?you are human|checking your browser|사람인지 확인/i,
        )
        .first()
        .isVisible())
    )
      throw new JungolError("manual_recovery_required");
  }
}
