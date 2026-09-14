import type { Page } from "playwright";
import {
  type AccountId,
  type GroupMemberSnapshot,
  groupMemberSchema,
} from "../domain/sync.js";
import { JungolError, rejectJungolHttpStatus } from "./errors.js";
import { type BrowserSettings, PageOperation } from "./page.js";
import type { JungolRequestCoordinator } from "./request-coordinator.js";

type MemberDom = {
  readonly accountId: string;
  readonly jungolName: string;
  readonly imagePaths: readonly string[];
};

const tierPath = /^\/solved\/([0-9]|[12][0-9]|3[01])\.svg$/;
const solvedPath = /^\/solved\//;
const sproutTierPath = "/solved/sprout-1.svg";

/** 그룹 메인 멤버 카드의 계정·직접 handle·공식 solved tier 이미지만 cycle snapshot으로 확정한다. */
export class GroupMemberCollector {
  private readonly pages = new PageOperation();

  constructor(
    private readonly settings: BrowserSettings,
    private readonly requests: JungolRequestCoordinator,
  ) {}

  collect(
    page: Page,
    groupId: number,
    signal?: AbortSignal,
  ): Promise<readonly GroupMemberSnapshot[]> {
    return this.pages.run(
      page,
      signal,
      async () =>
        this.requests.schedule("group_members", signal, async () => {
          const response = await this.pages.run(
            page,
            signal,
            () =>
              page.goto(
                new URL(`/group/${groupId}`, this.settings.baseUrl).href,
                {
                  waitUntil: "domcontentloaded",
                  timeout: this.settings.pageTimeoutMs,
                },
              ),
            {
              code: "group_members_timeout",
              stage: "navigation",
              timeoutMs: this.settings.pageTimeoutMs,
            },
          );
          rejectJungolHttpStatus(response?.status());
          if (!response?.ok()) throw new JungolError("jungol_http_rejected");
          if (page.url().includes("/auth/signin"))
            throw new JungolError("auth_required");
          if (
            /\/(?:cdn-cgi\/challenge|captcha(?:\/|$)|challenge(?:\/|$))/i.test(
              new URL(page.url()).pathname,
            )
          )
            throw new JungolError("manual_recovery_required");
          const ready = await page.waitForFunction(
            () => {
              const article = Array.from(
                document.querySelectorAll("article"),
              ).find((candidate) =>
                Array.from(
                  candidate.querySelectorAll("h1,h2,h3,h4,h5,h6"),
                ).some((heading) =>
                  /^멤버\s*$/.test(heading.textContent?.trim() ?? ""),
                ),
              );
              if (!article) return false;
              const headings = Array.from(
                article.querySelectorAll("h1,h2,h3,h4,h5,h6"),
              ).filter((heading) =>
                /^(?:소유자|멤버)\s*$/.test(heading.textContent?.trim() ?? ""),
              );
              const links: HTMLAnchorElement[] = [];
              const buttons: HTMLButtonElement[] = [];
              for (const heading of headings)
                for (
                  let sibling = heading.nextElementSibling;
                  sibling && !sibling.matches("h1,h2,h3,h4,h5,h6");
                  sibling = sibling.nextElementSibling
                ) {
                  links.push(
                    ...Array.from(
                      sibling.querySelectorAll<HTMLAnchorElement>(
                        'a[href*="/account/"]',
                      ),
                    ),
                  );
                  buttons.push(
                    ...Array.from(
                      sibling.querySelectorAll<HTMLButtonElement>("button"),
                    ),
                  );
                }
              const loading = /^(?:로드 중|로딩 중|loading)(?:\.\.\.|…)?$/i;
              if (
                buttons.some((button) =>
                  loading.test(button.textContent?.trim() ?? ""),
                )
              )
                return false;
              return (
                links.length > 0 &&
                links.every((link) =>
                  /^\/account\/[1-9][0-9]*\/?$/.test(
                    new URL(link.href).pathname,
                  ),
                )
              );
            },
            undefined,
            { timeout: this.settings.pageTimeoutMs },
          );
          await ready.dispose();
          const dom = await page.evaluate<MemberDom[]>(() => {
            const article = Array.from(
              document.querySelectorAll("article"),
            ).find((candidate) =>
              Array.from(candidate.querySelectorAll("h1,h2,h3,h4,h5,h6")).some(
                (heading) =>
                  /^멤버\s*$/.test(heading.textContent?.trim() ?? ""),
              ),
            );
            if (!article) return [];
            const headings = Array.from(
              article.querySelectorAll("h1,h2,h3,h4,h5,h6"),
            ).filter((heading) =>
              /^(?:소유자|멤버)\s*$/.test(heading.textContent?.trim() ?? ""),
            );
            const links: HTMLAnchorElement[] = [];
            for (const heading of headings)
              for (
                let sibling = heading.nextElementSibling;
                sibling && !sibling.matches("h1,h2,h3,h4,h5,h6");
                sibling = sibling.nextElementSibling
              )
                links.push(
                  ...Array.from(
                    sibling.querySelectorAll<HTMLAnchorElement>(
                      'a[href*="/account/"]',
                    ),
                  ),
                );
            return links.map((link) => ({
              accountId:
                new URL(link.href).pathname.match(
                  /^\/account\/([1-9][0-9]*)\/?$/,
                )?.[1] ?? "",
              jungolName:
                Array.from(link.childNodes)
                  .filter((node) => node.nodeType === Node.TEXT_NODE)
                  .map((node) => node.textContent ?? "")
                  .join(" ")
                  .trim() ||
                Array.from(link.querySelectorAll("button"))
                  .flatMap((button) =>
                    Array.from(button.childNodes)
                      .filter((node) => node.nodeType === Node.TEXT_NODE)
                      .map((node) => node.textContent ?? ""),
                  )
                  .join(" ")
                  .trim(),
              imagePaths: Array.from(link.querySelectorAll("img")).map(
                (image) => image.getAttribute("src")?.trim() ?? "",
              ),
            }));
          });
          const membersByAccountId = new Map<AccountId, GroupMemberSnapshot>();
          const members: GroupMemberSnapshot[] = [];
          for (const entry of dom) {
            if (entry.imagePaths.some((source) => source.length === 0))
              throw this.invalidMember(entry.accountId, true);
            const solvedImages = entry.imagePaths
              .filter((source) => !source.startsWith("data:"))
              .map((source) => new URL(source, this.settings.baseUrl))
              .filter(
                (url) =>
                  url.origin === "https://s.jungol.co.kr" &&
                  solvedPath.test(url.pathname),
              )
              .map((url) => url.pathname);
            if (
              solvedImages.some(
                (path) => !tierPath.test(path) && path !== sproutTierPath,
              )
            )
              throw this.invalidMember(entry.accountId, true);
            const tierImages = solvedImages
              .map((path) => tierPath.exec(path)?.[1])
              .filter((tier): tier is string => tier !== undefined);
            if (solvedImages.length > 1)
              throw this.invalidMember(entry.accountId, true);
            const parsed = groupMemberSchema.safeParse({
              accountId: entry.accountId,
              jungolName: entry.jungolName,
              tier: tierImages[0] === undefined ? 0 : Number(tierImages[0]),
            });
            if (!parsed.success) throw new JungolError("invalid_group_members");
            const existing = membersByAccountId.get(parsed.data.accountId);
            if (existing) {
              if (
                existing.jungolName !== parsed.data.jungolName ||
                existing.tier !== parsed.data.tier
              )
                throw new JungolError("duplicate_account");
              continue;
            }
            membersByAccountId.set(parsed.data.accountId, parsed.data);
            members.push(parsed.data);
          }
          if (members.length === 0)
            throw new JungolError("invalid_group_members");
          return members;
        }),
      {
        code: "group_members_timeout",
        stage: "group_members_readiness",
        timeoutMs: this.settings.pageTimeoutMs,
      },
    );
  }

  private invalidMember(
    accountId: string,
    imageObserved: boolean,
  ): JungolError {
    return new JungolError("invalid_group_members", {
      stage: "group_members_readiness",
      reason: "mismatch",
      observedAccountId: accountId,
      imageObserved,
    });
  }
}
