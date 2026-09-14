import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CollectorConfigLoader } from "../../src/config.js";
import { GroupFeedCollector } from "../../src/jungol/group-feed.js";
import { GroupMemberCollector } from "../../src/jungol/group-members.js";
import { ProblemMetadataResolver } from "../../src/jungol/metadata.js";
import { AccountProfileCollector } from "../../src/jungol/profile.js";
import { JungolRequestCoordinator } from "../../src/jungol/request-coordinator.js";
import { JungolSession } from "../../src/jungol/session.js";
import { SubmissionTimestampReader } from "../../src/jungol/submission-timestamp.js";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly COLLECTOR_SOURCE_REVISION?: string;
      readonly COLLECTOR_SOURCE_DIRTY?: string;
    }
  }
}

const credentials = {
  // biome-ignore lint/complexity/useLiteralKeys: ProcessEnv requires indexed access under noPropertyAccessFromIndexSignature.
  username: process.env["JUNGOL_USERNAME"],
  // biome-ignore lint/complexity/useLiteralKeys: ProcessEnv requires indexed access under noPropertyAccessFromIndexSignature.
  password: process.env["JUNGOL_PASSWORD"],
};

const koreanAbsoluteTimestamp =
  /^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*(?:오전|오후)\s*\d{1,2}:\d{2}:\d{2}$/;

type KstTimestampParts = {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly dayPeriod: string;
  readonly hour: string;
  readonly minute: string;
  readonly second: string;
};

function kstParts(date: Date): KstTimestampParts {
  const parts = new Map(
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const required = (
    name: keyof Intl.DateTimeFormatPartTypesRegistry,
  ): string => {
    const value = parts.get(name);
    assert.ok(value, `KST formatter omitted ${name}`);
    return value;
  };
  return {
    year: required("year"),
    month: required("month"),
    day: required("day"),
    dayPeriod: required("dayPeriod"),
    hour: required("hour"),
    minute: required("minute"),
    second: required("second"),
  };
}

test(
  "live Jungol AC time hover exposes an absolute Korean timestamp",
  { timeout: 300_000 },
  async (t) => {
    assert.ok(credentials.username, "JUNGOL_USERNAME is required");
    assert.ok(credentials.password, "JUNGOL_PASSWORD is required");
    const profileDir = await mkdtemp(join(tmpdir(), "jungol-live-dom-"));
    const requests = new JungolRequestCoordinator();
    let session: JungolSession | undefined;
    t.after(async () => {
      requests.close();
      try {
        await session?.close();
      } finally {
        await rm(profileDir, { recursive: true, force: true });
      }
    });

    const config = new CollectorConfigLoader({
      baseUrl: "https://jungol.co.kr",
      groupId: 1125,
      profileDir,
      intervalMs: 600_000,
      concurrency: 1,
      maxPages: 10,
      headless: true,
      loginTimeoutMs: 60_000,
      pageTimeoutMs: 30_000,
      randomSeed: "live-dom-contract",
      targetAccountId: undefined,
      runOnce: true,
      database: { host: "unused", port: 1, user: "unused", name: "unused" },
    }).parse({
      DB_PASSWORD: "unused",
      JUNGOL_USERNAME: credentials.username,
      JUNGOL_PASSWORD: credentials.password,
    });
    session = await JungolSession.launch(config, requests);
    await session.ensureLogin(config.credentials);
    t.diagnostic(
      JSON.stringify({
        browser: session.context.browser()?.version() ?? "persistent-context",
        platform: process.platform,
        architecture: process.arch,
        revision: process.env.COLLECTOR_SOURCE_REVISION ?? "unknown",
        sourceDirty: process.env.COLLECTOR_SOURCE_DIRTY ?? "unknown",
      }),
    );
    const memberPage = await session.newPage();
    const feedPage = await session.newPage();
    const metadataPage = await session.newPage();
    const profilePage = await session.newPage();
    t.after(() =>
      Promise.all([
        memberPage.close(),
        feedPage.close(),
        metadataPage.close(),
        profilePage.close(),
      ]),
    );
    const members = await new GroupMemberCollector(config, requests).collect(
      memberPage,
      config.groupId,
    );
    assert.ok(members.length > 0, "live group needs members");
    await requests.schedule("account_summary", undefined, () =>
      profilePage.goto(new URL("/account/339", config.baseUrl).href, {
        waitUntil: "domcontentloaded",
        timeout: config.pageTimeoutMs,
      }),
    );
    const solved339 = await new AccountProfileCollector(
      config,
      requests,
    ).collectSolved(profilePage);
    assert.ok(solved339.length > 50, "account 339 expansion must exceed 50");
    assert.equal(new Set(solved339).size, solved339.length);
    const advertisedSolved339 = await profilePage.evaluate(() => {
      const label = Array.from(document.querySelectorAll("*")).find(
        (element) =>
          element.textContent?.trim() === "맞은 문제" &&
          !Array.from(element.children).some(
            (child) => child.textContent?.trim() === "맞은 문제",
          ),
      );
      const matched = /^(0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)\s*문제$/.exec(
        label?.parentElement?.innerText.replace("맞은 문제", "").trim() ?? "",
      );
      if (!matched) return null;
      return Number(matched[1]?.replaceAll(",", ""));
    });
    assert.notEqual(advertisedSolved339, null);
    assert.equal(solved339.length, advertisedSolved339);
    const solvedSection = profilePage
      .getByText(/^(?:check\s*)?해결한 문제$/, { exact: true })
      .locator(
        "xpath=ancestor::section[contains(concat(' ', normalize-space(@class), ' '), ' card ')][1]",
      );
    const scopedSolvedCount = await solvedSection
      .locator('.problem-list a[href^="/problem/"]')
      .count();
    assert.equal(scopedSolvedCount, solved339.length);
    t.diagnostic(
      JSON.stringify({
        memberCount: members.length,
        solvedCount: solved339.length,
        advertisedSolvedCount: advertisedSolved339,
        scopedSolvedCount,
      }),
    );
    const feed = new GroupFeedCollector(config, requests);
    const first = await feed.readPage(feedPage, members, {
      lastScannedSubmissionId: null,
    });
    assert.ok(first.submissions.length >= 2, "live AC feed needs two rows");
    const timestamps = new SubmissionTimestampReader(30_000);
    const rows = feedPage.locator("table tbody tr");
    for (const rowIndex of [0, 1]) {
      const observed = await timestamps.read(feedPage, rows.nth(rowIndex));
      assert.match(observed.raw, koreanAbsoluteTimestamp);
      const parts = kstParts(observed.submittedAt);
      assert.equal(
        observed.raw,
        `${parts.year}. ${parts.month}. ${parts.day}. ${parts.dayPeriod} ${parts.hour}:${parts.minute}:${parts.second}`,
      );
      assert.equal(
        observed.submittedAt.getTime(),
        first.submissions[rowIndex]?.submittedAt.getTime(),
        "collector submission time must be the same instant shown by this row tooltip",
      );
    }
    if (first.more) {
      const firstLast =
        first.submissions.at(-1)?.submissionId ??
        assert.fail("missing first ID");
      const second = await feed.readPage(feedPage, members, {
        lastScannedSubmissionId: firstLast,
      });
      assert.ok(
        second.submissions.length > 0,
        "load-more must add an older row",
      );
      const firstIds = new Set(
        first.submissions.map((row) => row.submissionId),
      );
      assert.ok(
        second.submissions.every((row) => !firstIds.has(row.submissionId)),
        "load-more page must not repeat the first page rows",
      );
      assert.ok(
        second.submissions.every(
          (row) => BigInt(row.submissionId) < BigInt(firstLast),
        ),
        "load-more rows must be older than the first page boundary",
      );
    } else {
      t.diagnostic(
        "pagination unverified: Jungol reported an explicit end of list",
      );
    }
    const metadata = await new ProblemMetadataResolver(
      config,
      requests,
    ).resolve(
      metadataPage,
      first.submissions[0]?.problemId ?? assert.fail("missing first problem"),
    );
    assert.equal(metadata.problemId, first.submissions[0]?.problemId);
    assert.ok(metadata.tier >= 0 && metadata.tier <= 31);
  },
);
