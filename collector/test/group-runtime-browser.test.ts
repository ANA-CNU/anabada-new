import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { chromium } from "playwright";
import type { GroupFeedPage } from "../src/application/group-feed-scan-policy.js";
import { GroupRuntimeBrowser } from "../src/application/group-runtime-browser.js";
import { rankMemberSchema } from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";
import type { GroupFeedCollector } from "../src/jungol/group-feed.js";
import type { ProblemMetadataResolver } from "../src/jungol/metadata.js";
import type { AccountProfileCollector } from "../src/jungol/profile.js";
import type { RankCollector } from "../src/jungol/rank.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

const rankMember = rankMemberSchema.parse({
  accountId: "42",
  jungolName: "rank-authority",
  solvedCount: 1,
  wrongCount: 0,
  acRating: 320,
  tier: 7,
});
const staleMember = rankMemberSchema.parse({
  accountId: "42",
  jungolName: "stale-profile-input",
  solvedCount: 1,
  wrongCount: 0,
  acRating: 30,
  tier: 1,
});

test("Given a captured rank member When resolving an existing member Then no profile read supplies its rating or tier", async () => {
  let profileCalls = 0;
  let feedReads = 0;
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  try {
    const context = await browser.newContext();
    const runtime = new GroupRuntimeBrowser({
      newPage: () => context.newPage(),
      groupId: 1125,
      baseUrl: "https://group-runtime.test",
      pageTimeoutMs: 2_000,
      requests: new JungolRequestCoordinator({ delay: async () => {} }),
      rank: {
        collect: async () => [rankMember],
      } satisfies Pick<RankCollector, "collect">,
      feed: {
        readPage: async () => {
          feedReads += 1;
          return {
            submissions: [],
            nextCursor: null,
            more: false,
          } satisfies GroupFeedPage;
        },
      } satisfies Pick<GroupFeedCollector, "readPage">,
      profile: {
        collectSolved: async () => {
          profileCalls += 1;
          return [problemIdSchema.parse(1000)];
        },
      } satisfies Pick<AccountProfileCollector, "collectSolved">,
      metadata: {
        resolve: async (_page, problemId) => ({
          problemId,
          title: null,
          tier: 0,
        }),
      } satisfies Pick<ProblemMetadataResolver, "resolve">,
    });

    await runtime.members(new AbortController().signal);
    const member = await runtime.currentMember(
      rankMember.accountId,
      new AbortController().signal,
    );

    assert.equal(member.acRating, 320);
    assert.equal(member.tier, 7);
    assert.equal(profileCalls, 0);
    assert.equal(feedReads, 0);
    await runtime.close();
    await context.close();
  } finally {
    await browser.close();
  }
});

test("Given a new member When initializing Then profile supplies only solved problems and a fresh feed head supplies the cutoff", async () => {
  let profileCalls = 0;
  let feedReads = 0;
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  try {
    const context = await browser.newContext();
    await context.route("https://group-runtime.test/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<main>profile</main>" }),
    );
    const runtime = new GroupRuntimeBrowser({
      newPage: () => context.newPage(),
      groupId: 1125,
      baseUrl: "https://group-runtime.test",
      pageTimeoutMs: 2_000,
      requests: new JungolRequestCoordinator({ delay: async () => {} }),
      rank: { collect: async () => [rankMember] } satisfies Pick<
        RankCollector,
        "collect"
      >,
      feed: {
        readPage: async () => {
          feedReads += 1;
          return {
            submissions: [
              {
                accountId: rankMember.accountId,
                submissionId: submissionIdSchema.parse("9001"),
                problemId: problemIdSchema.parse(1000),
                submittedAt: new Date("2026-09-10T00:00:00Z"),
                score: null,
              },
            ],
            nextCursor: null,
            more: false,
          } satisfies GroupFeedPage;
        },
      } satisfies Pick<GroupFeedCollector, "readPage">,
      profile: {
        collectSolved: async () => {
          profileCalls += 1;
          return [problemIdSchema.parse(1000)];
        },
      } satisfies Pick<AccountProfileCollector, "collectSolved">,
      metadata: {
        resolve: async (_page, problemId) => ({
          problemId,
          title: null,
          tier: 0,
        }),
      } satisfies Pick<ProblemMetadataResolver, "resolve">,
    });
    await runtime.members(new AbortController().signal);
    const initial = await runtime.initialize(
      staleMember,
      new AbortController().signal,
    );

    assert.equal(profileCalls, 1);
    assert.equal(feedReads, 1);
    assert.deepEqual(
      initial.solved.map((solved) => solved.problemId),
      [1000],
    );
    assert.equal(initial.highestInspectedSubmissionId, 9001n);
    assert.equal(initial.member.acRating, 320);
    assert.equal(initial.member.tier, 7);
    await runtime.close();
    await context.close();
  } finally {
    await browser.close();
  }
});
