import { expect, test } from "bun:test";
import { SolvedAcClient } from "../src/boj/solved-ac.js";

const page = {
  page: 1,
  pageSize: 50,
  total: 1,
  problems: [
    {
      level: 1,
      judgeIds: [{ ojId: "boj", problemId: "1000" }],
      titles: [{ language: "ko", title: "A+B" }],
    },
  ],
};

const clientFor = (body: object) =>
  new SolvedAcClient({ clientId: "test", clientSecret: "test" }, async () =>
    Response.json(body),
  );

test("reads a successful solved.ac page that omits diagnostics", async () => {
  const client = clientFor(page);
  expect(
    await client.solvedPage("fixture", 1, AbortSignal.timeout(1000)),
  ).toEqual({
    kind: "resolved",
    value: {
      problems: [{ number: 1000, tier: 1, title: "A+B" }],
      nextPage: null,
    },
  });
});

test("retries a solved.ac page that contains an error diagnostic", async () => {
  const client = clientFor({ ...page, diagnostics: [{ severity: "error" }] });
  expect(
    await client.solvedPage("fixture", 1, AbortSignal.timeout(1000)),
  ).toEqual({
    kind: "retry",
    delay: 300,
  });
});

test("Given a user's rated and unrated solves When reading every page Then includes all 51 problems", async () => {
  const client = new SolvedAcClient(
    { clientId: "test", clientSecret: "test-secret" },
    async (url, init) => {
      const headers = new Headers(init.headers);
      if (
        url.pathname !== "/api/v4/problems" ||
        url.searchParams.get("q") !== "solved_by:fixture" ||
        headers.get("x-client-id") !== "test" ||
        headers.get("x-client-secret") !== "test-secret"
      )
        return new Response(null, { status: 400 });
      const pageNumber = Number(url.searchParams.get("page"));
      return Response.json({
        page: pageNumber,
        pageSize: 50,
        total: 51,
        problems: Array.from(
          { length: pageNumber === 1 ? 50 : 1 },
          (_, index) => ({
            level: pageNumber === 1 ? 1 : 0,
            judgeIds: [
              {
                ojId: "boj",
                problemId: String(1000 + (pageNumber - 1) * 50 + index),
              },
            ],
            titles: [],
          }),
        ),
      });
    },
  );
  const problems: number[] = [];
  let next: number | null = 1;
  while (next !== null) {
    const result = await client.solvedPage(
      "fixture",
      next,
      AbortSignal.timeout(1000),
    );
    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") throw new Error("Problem page failed");
    problems.push(...result.value.problems.map(({ number }) => number));
    next = result.value.nextPage;
  }
  expect(problems).toEqual(
    Array.from({ length: 51 }, (_, index) => 1000 + index),
  );
});

test("Given a linked BOJ account When looking up a user Then resolves the official profile alias", async () => {
  const client = clientFor({
    handle: "solved-alias",
    tier: null,
    ojAccounts: [{ ojId: "boj", handle: "Fixture" }],
  });
  const result = await client.profile("fixture", AbortSignal.timeout(1000));
  expect(result).toEqual({
    kind: "resolved",
    value: { handle: "solved-alias", tier: 31 },
  });
});

test("Given an unrelated BOJ account When looking up a user Then does not admit that user", async () => {
  const client = clientFor({
    handle: "fixture",
    tier: 15,
    ojAccounts: [{ ojId: "boj", handle: "another-user" }],
  });
  const result = await client.profile("fixture", AbortSignal.timeout(1000));
  expect(result).toEqual({ kind: "missing" });
});

test("Given rate limiting When reading solved problems Then preserves Retry-After", async () => {
  const client = new SolvedAcClient(
    { clientId: "test", clientSecret: "test" },
    async () =>
      new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
  );
  const result = await client.solvedPage(
    "fixture",
    1,
    AbortSignal.timeout(1000),
  );
  expect(result).toEqual({ kind: "cooldown", delay: 120 });
});
