import { type Page, chromium } from "playwright-core";
import {
  type SolvedAcFailure,
  retryAfterSeconds,
} from "./solved-ac-provider.js";

export type ProfileCheck =
  | { readonly kind: "resolved"; readonly handle: string }
  | { readonly kind: "missing" }
  | SolvedAcFailure;

const origin = "https://solved.ac";
const timeout = 10_000;
const retry = { kind: "retry", delay: 300 } as const;
const profilePath = /^\/ko\/u\/([A-Za-z0-9_-]{1,64})\/?$/;

function profileHandle(
  url: URL | null,
  expectedOrigin: string,
): string | undefined {
  return url?.origin === expectedOrigin
    ? profilePath.exec(url.pathname)?.[1]
    : undefined;
}

export function linkedSolvedProfile(
  requested: string,
  page: {
    readonly address: string;
    readonly status: number;
    readonly missingHeading: boolean;
    readonly profileHeading: boolean;
    readonly nativeLinks: readonly string[];
  },
  expectedOrigin = origin,
): ProfileCheck {
  const { address, status, missingHeading, profileHeading, nativeLinks } = page;
  const handle = profileHandle(URL.parse(address), expectedOrigin);
  if (!handle || (status !== 200 && status !== 404)) return retry;
  if (profileHeading) {
    const nativeProfile = `/user/${requested.toLowerCase()}`;
    const linked = nativeLinks.some((href) => {
      const link = URL.parse(href, origin);
      return (
        (link?.origin === "https://acmicpc.net" ||
          link?.origin === "https://www.acmicpc.net") &&
        link.pathname.toLowerCase() === nativeProfile
      );
    });
    return status === 200 && linked ? { kind: "resolved", handle } : retry;
  }
  if (missingHeading && handle.toLowerCase() === requested.toLowerCase())
    return { kind: "missing" };
  return retry;
}

export async function openSingleDocument(page: Page, url: URL) {
  const session = await page.context().newCDPSession(page);
  let documentRequested = false;
  // Playwright's page.route only sees the first URL of a redirect chain.
  session.on("Fetch.requestPaused", ({ requestId, request, resourceType }) => {
    const allowed =
      !documentRequested &&
      resourceType === "Document" &&
      request.method === "GET" &&
      request.url === url.href;
    if (allowed) documentRequested = true;
    const action = allowed
      ? session.send("Fetch.continueRequest", { requestId })
      : session.send("Fetch.failRequest", {
          requestId,
          errorReason: "Aborted",
        });
    void action.catch(() => {});
  });
  await session.send("Fetch.enable");
  return page.goto(url.href, { timeout, waitUntil: "domcontentloaded" });
}

export async function checkSolvedProfile(
  handle: string,
  signal: AbortSignal,
  profileOrigin = origin,
): Promise<ProfileCheck> {
  const url = new URL(`/ko/u/${encodeURIComponent(handle)}`, profileOrigin);
  signal.throwIfAborted();
  try {
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH,
      timeout,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    });
    const abort = () => void browser.close().catch(() => {});
    signal.addEventListener("abort", abort, { once: true });
    try {
      signal.throwIfAborted();
      const page = await browser.newPage({
        javaScriptEnabled: false,
        serviceWorkers: "block",
      });
      const response = await openSingleDocument(page, url);
      if (!response) return retry;
      const status = response.status();
      if (status === 429) {
        const header = await response.headerValue("retry-after");
        return {
          kind: "cooldown",
          delay: retryAfterSeconds(header, Date.now(), 120),
        };
      }
      if (status !== 200 && status !== 404) return retry;
      const address = page.url();
      const canonicalHandle = profileHandle(URL.parse(address), url.origin);
      if (!canonicalHandle) return retry;
      const missing = page.getByRole("heading", {
        name: "페이지를 찾을 수 없습니다",
        exact: true,
      });
      const profile = page.getByRole("heading", {
        name: canonicalHandle,
        exact: true,
        level: 2,
      });
      const nativeLinks = await page
        .locator('a[href*="acmicpc.net/user/"]')
        .evaluateAll((links) =>
          links.map((link) => link.getAttribute("href") ?? ""),
        );
      return linkedSolvedProfile(
        handle,
        {
          address,
          status,
          missingHeading: Boolean(await missing.count()),
          profileHeading: Boolean(await profile.count()),
          nativeLinks,
        },
        url.origin,
      );
    } finally {
      signal.removeEventListener("abort", abort);
      await browser.close();
    }
  } catch {
    signal.throwIfAborted();
    return retry;
  }
}
