import { errors, type Page } from "playwright";
import { z } from "zod";
import {
  type AccountId,
  type GroupMemberSnapshot,
  groupMemberSchema,
} from "../domain/sync.js";
import { JungolError, rejectJungolHttpStatus } from "./errors.js";
import { type BrowserSettings, PageOperation } from "./page.js";
import type { JungolRequestCoordinator } from "./request-coordinator.js";

const groupPeopleDomSchema = z.object({
  members: z.array(
    z.object({
      accountId: z.string(),
      jungolName: z.string(),
      imagePaths: z.array(z.string()),
    }),
  ),
  advertisedMemberCount: z.number().int().nonnegative(),
  observedMemberCount: z.number().int().nonnegative(),
});

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
            await page
              .getByText(/로그인이 필요해요|그룹에 가입해야 해요/)
              .first()
              .isVisible()
          )
            throw new JungolError("auth_required");
          if (
            /\/(?:cdn-cgi\/challenge|captcha(?:\/|$)|challenge(?:\/|$))/i.test(
              new URL(page.url()).pathname,
            )
          )
            throw new JungolError("manual_recovery_required");
          let ready: Awaited<ReturnType<typeof page.waitForFunction>>;
          try {
            ready = await page.waitForFunction(
              () => {
                const peopleCard = document.querySelector(
                  "section.group-card.group-people",
                );
                if (!peopleCard) return false;
                const sections = Array.from(
                  peopleCard.querySelectorAll(":scope > .people-section"),
                );
                const owner = sections.find(
                  (section) =>
                    section
                      .querySelector(
                        ":scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6",
                      )
                      ?.textContent?.trim() === "소유자",
                );
                const members = sections.find((section) =>
                  /^멤버\s+(0|[1-9]\d*)명$/.test(
                    section
                      .querySelector(
                        ":scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6",
                      )
                      ?.textContent?.trim() ?? "",
                  ),
                );
                if (!owner || !members) return false;
                const ownerLinks = Array.from(
                  owner.querySelectorAll(
                    ':scope > .people a[href*="/account/"]',
                  ),
                );
                const memberLinks = Array.from(
                  members.querySelectorAll(
                    ':scope > .people a[href*="/account/"]',
                  ),
                );
                const links: HTMLAnchorElement[] = [];
                const buttons: HTMLButtonElement[] = [];
                for (const section of [owner, members]) {
                  const people = section.querySelector(":scope > .people");
                  if (!people) return false;
                  links.push(
                    ...Array.from(
                      people.querySelectorAll<HTMLAnchorElement>(
                        'a[href*="/account/"]',
                      ),
                    ),
                  );
                  buttons.push(
                    ...Array.from(
                      people.querySelectorAll<HTMLButtonElement>("button"),
                    ),
                  );
                }
                const memberCount = Number(
                  /^멤버\s+(0|[1-9]\d*)명$/.exec(
                    members
                      .querySelector(
                        ":scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6",
                      )
                      ?.textContent?.trim() ?? "",
                  )?.[1],
                );
                const loading = /^(?:로드 중|로딩 중|loading)(?:\.\.\.|…)?$/i;
                if (
                  buttons.some((button) =>
                    loading.test(button.textContent?.trim() ?? ""),
                  )
                )
                  return false;
                if (
                  ownerLinks.length === 0 ||
                  memberLinks.length !== memberCount ||
                  !links.every((link) =>
                    /^\/account\/[1-9][0-9]*\/?$/.test(
                      new URL(link.href).pathname,
                    ),
                  )
                )
                  return false;
                return {
                  advertisedMemberCount: memberCount,
                  observedMemberCount: memberLinks.length,
                  members: links.map((link) => ({
                    accountId:
                      new URL(link.href).pathname.match(
                        /^\/account\/([1-9][0-9]*)\/?$/,
                      )?.[1] ?? "",
                    jungolName: (() => {
                      const directHandle = Array.from(link.childNodes)
                        .filter((node) => node.nodeType === Node.TEXT_NODE)
                        .map((node) => node.textContent ?? "")
                        .join(" ")
                        .trim();
                      if (directHandle) return directHandle;
                      // 현재 카드의 이름은 badge와 분리된 account-id 직접 텍스트만 허용한다.
                      const currentHandleElements = Array.from(
                        link.querySelectorAll(
                          ":scope > div > button > span.account-id",
                        ),
                      );
                      if (currentHandleElements.length > 0) {
                        const currentHandles = currentHandleElements.map(
                          (handle) =>
                            Array.from(handle.childNodes)
                              .filter(
                                (node) => node.nodeType === Node.TEXT_NODE,
                              )
                              .map((node) => node.textContent ?? "")
                              .join(" ")
                              .trim(),
                        );
                        return currentHandles.length === 1 && currentHandles[0]
                          ? currentHandles[0]
                          : "";
                      }
                      return Array.from(link.querySelectorAll("button"))
                        .flatMap((button) =>
                          Array.from(button.childNodes)
                            .filter((node) => node.nodeType === Node.TEXT_NODE)
                            .map((node) => node.textContent ?? ""),
                        )
                        .join(" ")
                        .trim();
                    })(),
                    imagePaths: Array.from(link.querySelectorAll("img")).map(
                      (image) => image.getAttribute("src")?.trim() ?? "",
                    ),
                  })),
                };
              },
              undefined,
              { timeout: this.settings.pageTimeoutMs },
            );
          } catch (error) {
            if (
              error instanceof errors.TimeoutError &&
              (await page
                .getByText(/로그인이 필요해요|그룹에 가입해야 해요/)
                .first()
                .isVisible())
            )
              throw new JungolError("auth_required");
            throw error;
          }
          const dom = groupPeopleDomSchema.parse(await ready.jsonValue());
          await ready.dispose();
          if (dom.observedMemberCount !== dom.advertisedMemberCount)
            throw new JungolError("invalid_group_members");
          const membersByAccountId = new Map<AccountId, GroupMemberSnapshot>();
          const members: GroupMemberSnapshot[] = [];
          for (const entry of dom.members) {
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
