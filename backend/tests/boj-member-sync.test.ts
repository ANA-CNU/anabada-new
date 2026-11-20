import { expect, test } from "bun:test";
import {
  BojSubmissionPageError,
  bojSubmissionId,
  syncBojMember,
} from "../src/boj/member-sync.js";

type Ports = Parameters<typeof syncBojMember>[1];
type Settlement = Parameters<Ports["commit"]>[0];

const input = {
  member: { handle: "fixture-user", solvedCount: 11, submissionCount: 25 },
  checkpoint: {
    committedThrough: bojSubmissionId.parse("100"),
    solvedCount: 10,
    submissionCount: 20,
    retryRequired: false,
  },
  reconcile: false,
  signal: new AbortController().signal,
};

const ac = (id: string) => ({
  id,
  verdict: "accepted",
  problemNumber: 1000,
  submittedAt: new Date("2026-11-20T01:00:00Z"),
});

function fixture(pages: ReadonlyMap<string | null, unknown>) {
  const requested: Array<string | null> = [];
  const settlements: Settlement[] = [];
  const ports: Ports = {
    readPage: async ({ top }) => {
      requested.push(top);
      if (!pages.has(top)) throw new Error("unexpected fixture page");
      const response = pages.get(top);
      if (response instanceof Error) throw response;
      return response;
    },
    commit: async (settlement) => {
      settlements.push(settlement);
    },
  };
  return { ports, requested, settlements };
}

test("follows the site's next top and stops when a row is below a missing checkpoint", async () => {
  const feed = fixture(
    new Map([
      [null, { submissions: [ac("118"), ac("115")], nextTop: "107" }],
      ["107", { submissions: [ac("107"), ac("98")], nextTop: "90" }],
    ]),
  );

  await expect(syncBojMember(input, feed.ports)).resolves.toBe("settled");

  expect(feed.requested).toEqual([null, "107"]);
  expect(feed.settlements).toHaveLength(1);
  expect(feed.settlements[0]?.accepted.map(({ id }) => String(id))).toEqual([
    "107",
    "115",
    "118",
  ]);
  expect(feed.settlements[0]?.committedThrough).toBe(
    bojSubmissionId.parse("118"),
  );
});

test("leaves newer answers for retry when an older submission is still being judged", async () => {
  const feed = fixture(
    new Map([
      [
        null,
        {
          submissions: [
            ac("115"),
            { id: "112", verdict: "pending" },
            ac("107"),
            ac("100"),
          ],
          nextTop: null,
        },
      ],
    ]),
  );

  await expect(syncBojMember(input, feed.ports)).resolves.toBe("pending");

  expect(feed.settlements[0]).toMatchObject({
    expectedCursor: "100",
    committedThrough: "107",
    accepted: [ac("107")],
    retryRequired: true,
  });
});

test("retries a pending member even when rank totals have not changed", async () => {
  const feed = fixture(
    new Map([
      [null, { submissions: [ac("115"), ac("112"), ac("107")], nextTop: null }],
    ]),
  );

  await expect(
    syncBojMember(
      {
        ...input,
        checkpoint: {
          ...input.checkpoint,
          committedThrough: bojSubmissionId.parse("107"),
          solvedCount: input.member.solvedCount,
          submissionCount: input.member.submissionCount,
          retryRequired: true,
        },
      },
      feed.ports,
    ),
  ).resolves.toBe("settled");

  expect(feed.settlements[0]?.accepted.map(({ id }) => String(id))).toEqual([
    "112",
    "115",
  ]);
  expect(feed.settlements[0]?.retryRequired).toBe(false);
});

test("skips unchanged rank totals between reconciliations", async () => {
  const feed = fixture(new Map());

  const result = await syncBojMember(
    {
      ...input,
      checkpoint: {
        ...input.checkpoint,
        solvedCount: input.member.solvedCount,
        submissionCount: input.member.submissionCount,
      },
    },
    feed.ports,
  );

  expect(result).toBe("skipped");
  expect(feed.requested).toHaveLength(0);
  expect(feed.settlements).toHaveLength(0);
});

test("periodic reconciliation reads submissions even when both rank totals match", async () => {
  const feed = fixture(
    new Map([[null, { submissions: [ac("107"), ac("100")], nextTop: null }]]),
  );

  await syncBojMember(
    {
      ...input,
      checkpoint: {
        ...input.checkpoint,
        solvedCount: input.member.solvedCount,
        submissionCount: input.member.submissionCount,
      },
      reconcile: true,
    },
    feed.ports,
  );

  expect(feed.settlements[0]?.committedThrough).toBe(
    bojSubmissionId.parse("107"),
  );
});

test("advances the cursor across final non-AC rows without treating them as solves", async () => {
  const feed = fixture(
    new Map([
      [
        null,
        {
          submissions: [
            { id: "110", verdict: "terminal" },
            ac("107"),
            ac("100"),
          ],
          nextTop: null,
        },
      ],
    ]),
  );

  await syncBojMember(input, feed.ports);

  expect(feed.settlements[0]).toMatchObject({
    committedThrough: "110",
    accepted: [ac("107")],
    retryRequired: false,
  });
});

test("makes no commit if a later page fails after newer answers were already read", async () => {
  const failure = new Error("fixture request failed");
  const feed = fixture(
    new Map<string | null, unknown>([
      [null, { submissions: [ac("115")], nextTop: "107" }],
      ["107", failure],
    ]),
  );

  await expect(syncBojMember(input, feed.ports)).rejects.toBe(failure);

  expect(feed.settlements).toHaveLength(0);
});

test("rejects a next page that repeats an ID above its advertised top", async () => {
  const feed = fixture(
    new Map([
      [null, { submissions: [ac("115")], nextTop: "107" }],
      ["107", { submissions: [ac("115"), ac("100")], nextTop: null }],
    ]),
  );

  await expect(syncBojMember(input, feed.ports)).rejects.toMatchObject({
    reason: "invalid_order",
  });

  expect(feed.settlements).toHaveLength(0);
});

test.each([
  { submissions: [ac("not-an-id")], nextTop: null },
  { submissions: [ac("100"), ac("115")], nextTop: null },
  { submissions: [ac("115")], nextTop: "115" },
  { submissions: [], nextTop: "107" },
])(
  "rejects malformed or nonadvancing pages before writing a checkpoint (%j)",
  async (invalid) => {
    const feed = fixture(new Map([[null, invalid]]));

    await expect(syncBojMember(input, feed.ports)).rejects.toBeInstanceOf(
      BojSubmissionPageError,
    );

    expect(feed.settlements).toHaveLength(0);
  },
);
