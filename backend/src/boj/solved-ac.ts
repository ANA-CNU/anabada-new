import { z } from "zod";
import {
  type SolvedAcFailure,
  retryAfterSeconds,
} from "./solved-ac-provider.js";

const v4Problem = z.object({
  level: z.number().min(0).max(31),
  judgeIds: z.array(z.object({ ojId: z.string(), problemId: z.string() })),
  titles: z.array(z.object({ language: z.string(), title: z.string() })),
});
const v4Profile = z.object({
  handle: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  tier: z.number().int().min(0).max(31).nullable(),
  ojAccounts: z.array(z.object({ ojId: z.string(), handle: z.string() })),
});
const v4Page = z.object({
  problems: z.array(v4Problem),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.literal(50),
  diagnostics: z
    .array(z.object({ severity: z.enum(["warning", "error"]) }))
    .default([]),
});

export type SolvedAcReply<T> =
  | { readonly kind: "resolved"; readonly value: T }
  | { readonly kind: "missing" }
  | SolvedAcFailure;
export type SolvedAcCredentials = Readonly<{
  clientId: string;
  clientSecret: string;
}>;
export type HistoricalProblem = Readonly<{
  number: number;
  tier: number;
  title: string | null;
}>;
type Profile = Readonly<{ handle: string; tier: number }>;
export type ProblemMetadata = Omit<HistoricalProblem, "number">;
export type SettlementTiers = Readonly<{
  profile: Profile;
  problems: ReadonlyMap<number, ProblemMetadata>;
}>;

function problemMetadata(problem: z.infer<typeof v4Problem>) {
  const title =
    problem.titles.find(({ language }) => language === "ko")?.title ??
    problem.titles[0]?.title;
  return {
    tier: Math.floor(problem.level),
    title: title?.slice(0, 255) ?? null,
  };
}

export class SolvedAcClient {
  constructor(
    private readonly credentials: SolvedAcCredentials,
    private readonly request: (
      url: URL,
      init: RequestInit,
    ) => Promise<Response> = fetch,
  ) {}

  async profile(
    bojHandle: string,
    signal: AbortSignal,
    lookupHandle = bojHandle,
  ): Promise<SolvedAcReply<Profile>> {
    const result = await this.read(
      new URL(
        `https://solved.ac/api/v4/users/${encodeURIComponent(lookupHandle)}`,
      ),
      v4Profile,
      signal,
    );
    if (result.kind !== "resolved") return result;
    if (
      !result.value.ojAccounts.some(
        ({ ojId, handle }) =>
          ojId.toLowerCase() === "boj" &&
          handle.toLowerCase() === bojHandle.toLowerCase(),
      )
    )
      return { kind: "missing" };
    return {
      kind: "resolved",
      value: { handle: result.value.handle, tier: result.value.tier ?? 31 },
    };
  }

  async solvedPage(
    handle: string,
    page: number,
    signal: AbortSignal,
  ): Promise<
    SolvedAcReply<{
      problems: readonly HistoricalProblem[];
      nextPage: number | null;
    }>
  > {
    const url = new URL("https://solved.ac/api/v4/problems");
    url.search = new URLSearchParams({
      q: `solved_by:${handle}`,
      sort: "id",
      direction: "asc",
      page: String(page),
    }).toString();
    const result = await this.read(url, v4Page, signal);
    if (result.kind !== "resolved")
      return result.kind === "missing" ? { kind: "retry", delay: 300 } : result;
    const { total, pageSize, problems, diagnostics } = result.value;
    const expectedLength = Math.min(
      pageSize,
      Math.max(0, total - (page - 1) * pageSize),
    );
    if (
      result.value.page !== page ||
      problems.length !== expectedLength ||
      diagnostics.some(({ severity }) => severity === "error")
    )
      return { kind: "retry", delay: 300 };
    const known = new Map<number, HistoricalProblem>();
    for (const problem of problems) {
      const [judge] = problem.judgeIds;
      // A merged entry does not identify which original judge/problem the user solved.
      if (
        problem.judgeIds.length !== 1 ||
        !judge ||
        judge.ojId.toLowerCase() !== "boj" ||
        !/^[1-9]\d{0,9}$/.test(judge.problemId)
      )
        continue;
      const number = Number(judge.problemId);
      if (number <= 4_294_967_295)
        known.set(number, { number, ...problemMetadata(problem) });
    }
    return {
      kind: "resolved",
      value: {
        problems: [...known.values()],
        nextPage: page * pageSize < total ? page + 1 : null,
      },
    };
  }

  async problem(
    number: number,
    signal: AbortSignal,
  ): Promise<SolvedAcReply<ProblemMetadata>> {
    const result = await this.read(
      new URL(`https://solved.ac/api/v4/problems/${number}`),
      v4Problem,
      signal,
    );
    if (
      result.kind === "resolved" &&
      result.value.judgeIds.some(
        ({ ojId, problemId }) =>
          ojId.toLowerCase() === "boj" && problemId === String(number),
      )
    )
      return { kind: "resolved", value: problemMetadata(result.value) };
    if (result.kind === "resolved" || result.kind === "missing")
      return { kind: "retry", delay: 900 };
    return result;
  }

  private async read<T>(
    url: URL,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    signal: AbortSignal,
  ): Promise<SolvedAcReply<T>> {
    try {
      const response = await this.request(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        redirect: "manual",
        headers: {
          Accept: "application/json",
          "User-Agent": "ANABADA/1.0",
          "x-client-id": this.credentials.clientId,
          "x-client-secret": this.credentials.clientSecret,
        },
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 404) return { kind: "missing" };
        if (response.status === 401 || response.status === 403)
          return { kind: "blocked" };
        if (response.status === 429)
          return {
            kind: "cooldown",
            delay: retryAfterSeconds(
              response.headers.get("retry-after"),
              Date.now(),
              60,
            ),
          };
        return { kind: "retry", delay: 60 };
      }
      const result = schema.safeParse(await response.json());
      if (result.success) return { kind: "resolved", value: result.data };
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof Error)) throw error;
    }
    return { kind: "retry", delay: 60 };
  }
}
