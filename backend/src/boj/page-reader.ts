import { setTimeout as sleep } from "node:timers/promises";
import { parseBojRank, parseBojStatus } from "./html-source.js";
import type { BojSubmissionPageRequest } from "./member-sync.js";

const origin = "https://acmicpc.net";
const minimumGapMs = 5_000;
const requestTimeoutMs = 10_000;
const defaultCooldownMs = 60_000;
const maxGroupPages = 100;

type ReaderDependencies = {
  readonly request: (url: URL, signal: AbortSignal) => Promise<Response>;
  readonly monotonicNow: () => number;
  readonly wallNow: () => number;
  readonly wait: (ms: number, signal: AbortSignal) => Promise<void>;
};

const defaults: ReaderDependencies = {
  request: (url, signal) =>
    fetch(url, {
      signal,
      redirect: "manual",
      headers: {
        Accept: "text/html",
        "Accept-Language": "ko-KR",
        "User-Agent": "ANABADA/1.0",
      },
    }),
  monotonicNow: () => performance.now(),
  wallNow: () => Date.now(),
  wait: (ms, signal) => sleep(ms, undefined, { signal }),
};

export class BojReadError extends Error {
  readonly name = "BojReadError";

  constructor(
    readonly reason: "http_status" | "invalid_content_type" | "invalid_roster",
    readonly status?: number,
  ) {
    super(reason);
  }
}

function retryDelayMs(header: string | null, now: number): number {
  if (!header) return defaultCooldownMs;
  if (/^\d{1,10}$/.test(header)) return Number(header) * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : defaultCooldownMs;
}

/** 그룹 랭킹과 채점 현황의 모든 HTTP 요청이 한 대기열을 거친다. */
export class BojPageReader {
  private readonly deps: ReaderDependencies;
  private tail: Promise<void> = Promise.resolve();
  private nextAt = 0;

  constructor(dependencies: Partial<ReaderDependencies> = {}) {
    this.deps = { ...defaults, ...dependencies };
  }

  async readGroupMembers(groupId: number, signal: AbortSignal) {
    const members = new Map<
      string,
      Awaited<ReturnType<typeof parseBojRank>>["members"][number]
    >();
    let lastPage = 1;
    for (let page = 1; page <= lastPage; page += 1) {
      const url = new URL(`/group/ranklist/${groupId}/${page}`, origin);
      const result = await parseBojRank(
        await this.readHtml(url, signal),
        groupId,
      );
      lastPage = Math.max(lastPage, ...result.pages);
      if (lastPage > maxGroupPages || (page > 1 && result.members.length === 0))
        throw new BojReadError("invalid_roster");
      for (const member of result.members) {
        const key = member.handle.toLowerCase();
        if (members.has(key)) throw new BojReadError("invalid_roster");
        members.set(key, member);
      }
    }
    return [...members.values()];
  }

  async readSubmissionPage({ handle, top, signal }: BojSubmissionPageRequest) {
    const url = new URL("/status", origin);
    url.searchParams.set("user_id", handle);
    if (top !== null) url.searchParams.set("top", top);
    return parseBojStatus(await this.readHtml(url, signal), handle);
  }

  private readHtml(url: URL, signal: AbortSignal): Promise<string> {
    const request = this.tail.then(async () => {
      signal.throwIfAborted();
      let remaining = this.nextAt - this.deps.monotonicNow();
      while (remaining > 0) {
        await this.deps.wait(Math.min(remaining, defaultCooldownMs), signal);
        signal.throwIfAborted();
        remaining = this.nextAt - this.deps.monotonicNow();
      }
      const requestSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(requestTimeoutMs),
      ]);
      let cooldownMs = minimumGapMs;
      try {
        const response = await this.deps.request(url, requestSignal);
        if (response.status === 429 || response.status === 503) {
          cooldownMs = Math.max(
            cooldownMs,
            retryDelayMs(
              response.headers.get("retry-after"),
              this.deps.wallNow(),
            ),
          );
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new BojReadError("http_status", response.status);
        }
        if (
          !response.headers
            .get("content-type")
            ?.toLowerCase()
            .startsWith("text/html")
        ) {
          await response.body?.cancel();
          throw new BojReadError("invalid_content_type");
        }
        return await response.text();
      } finally {
        this.nextAt = this.deps.monotonicNow() + cooldownMs;
      }
    });
    this.tail = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  }
}
