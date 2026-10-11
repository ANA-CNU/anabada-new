import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CollectorConfigLoader } from "../../src/config.js";
import { GroupFeedCollector } from "../../src/jungol/group-feed.js";
import { GroupMemberCollector } from "../../src/jungol/group-members.js";
import { JungolRequestCoordinator } from "../../src/jungol/request-coordinator.js";
import { JungolSession } from "../../src/jungol/session.js";
import { SubmissionTimestampReader } from "../../src/jungol/submission-timestamp.js";

test(
  "live current group AC DOM reads timestamped rows through production collectors",
  { timeout: 180_000 },
  async (t) => {
    const { JUNGOL_USERNAME: username, JUNGOL_PASSWORD: password } =
      process.env;
    assert.ok(username && password, "Jungol credentials are required");
    const profileDir = await mkdtemp(
      join(tmpdir(), "jungol-live-current-feed-"),
    );
    const requests = new JungolRequestCoordinator();
    let session: JungolSession | undefined;
    try {
      const config = new CollectorConfigLoader({
        baseUrl: "https://jungol.co.kr",
        groupId: 1125,
        profileDir,
        intervalMs: 600_000,
        concurrency: 1,
        maxPages: 2,
        headless: true,
        loginTimeoutMs: 60_000,
        pageTimeoutMs: 30_000,
        randomSeed: "live-current-feed",
        targetAccountId: undefined,
        runOnce: true,
        database: { host: "unused", port: 1, user: "unused", name: "unused" },
      }).parse({
        DB_PASSWORD: "unused",
        JUNGOL_USERNAME: username,
        JUNGOL_PASSWORD: password,
      });
      session = await JungolSession.launch(config, requests);
      await session.ensureLogin(config.credentials);
      const membersPage = await session.newPage();
      const feedPage = await session.newPage();
      const members = await new GroupMemberCollector(config, requests).collect(
        membersPage,
        config.groupId,
      );
      const feed = new GroupFeedCollector(config, requests);
      const first = await feed.readPage(feedPage, members, {
        lastScannedSubmissionId: null,
      });
      assert.ok(
        first.submissions.length >= 2,
        "at least two current AC rows are required",
      );
      const timestamps = new SubmissionTimestampReader(30_000);
      const rows = feedPage.locator("table tbody tr");
      for (const index of [0, 1]) {
        const observed = await timestamps.read(feedPage, rows.nth(index));
        assert.equal(
          observed.submittedAt.getTime(),
          first.submissions[index]?.submittedAt.getTime(),
        );
      }
      let pagination = "unverified_no_more";
      if (first.more) {
        const marker = first.submissions.at(-1)?.submissionId;
        assert.ok(marker, "first page requires a marker");
        const second = await feed.readPage(feedPage, members, {
          lastScannedSubmissionId: marker,
        });
        assert.ok(
          second.submissions.length > 0,
          "load-more must return older submissions",
        );
        assert.ok(
          second.submissions.every(
            (submission) => BigInt(submission.submissionId) < BigInt(marker),
          ),
        );
        assert.equal(
          new Set(
            [...first.submissions, ...second.submissions].map(
              (submission) => submission.submissionId,
            ),
          ).size,
          first.submissions.length + second.submissions.length,
        );
        pagination = "verified";
      }
      t.diagnostic(
        JSON.stringify({
          rowCount: first.submissions.length,
          firstTimestamp: first.submissions[0]?.submittedAt.toISOString(),
          lastTimestamp: first.submissions.at(-1)?.submittedAt.toISOString(),
          browser: session.context.browser()?.version() ?? "persistent",
          more: first.more,
          pagination,
        }),
      );
      await membersPage.close();
      await feedPage.close();
    } finally {
      requests.close();
      await session?.close();
      await rm(profileDir, { recursive: true, force: true });
    }
  },
);
