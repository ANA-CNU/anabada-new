import { afterAll, beforeAll, expect, test } from "bun:test";
import jwt from "jsonwebtoken";
import type { RowDataPacket } from "mysql2/promise";
import { BojCycleRunner } from "../../src/boj/cycle.js";
import { BojMemberSettlement } from "../../src/boj/member-settlement.js";
import {
  type BojSubmissionPageRequest,
  type RankMember,
  bojSubmissionCursor,
  bojSubmissionId,
} from "../../src/boj/member-sync.js";
import { withBojLease } from "../../src/boj/mysql-lease.js";
import { BojPageReader } from "../../src/boj/page-reader.js";
import { BojRankingNotifications } from "../../src/boj/ranking-notifications.js";
import { BojRankingProjection } from "../../src/boj/ranking-projection.js";
import { SolvedAcCollector } from "../../src/boj/solved-ac-collector.js";
import { SolvedAcClient } from "../../src/boj/solved-ac.js";
import { BojSolvedHistory } from "../../src/boj/solved-history.js";
import { bootstrap } from "../../src/bootstrap.js";
import { BackendConfigLoader } from "../../src/config/backend-config.js";
import {
  type InitializedDatabase,
  initializeDatabase,
} from "../../src/infrastructure/mysql/pool-factory.js";

const now = new Date("2026-11-20T10:00:00Z");
const signal = new AbortController().signal;
const ac = (number: number, problemNumber: number, time: string) => ({
  id: bojSubmissionId.parse(String(number)),
  verdict: "accepted" as const,
  problemNumber,
  submittedAt: new Date(time),
});
const makeMember = (
  handle: string,
  solvedCount: number,
  submissionCount: number,
): RankMember => ({
  handle,
  solvedCount,
  submissionCount,
});
const fixtureSolvedAc = {
  observe(handles: readonly string[]) {
    return new Map(handles.map((handle) => [handle.toLowerCase(), handle]));
  },
  async readTiers(
    handle: string,
    _solvedHandle: string | null,
    numbers: readonly number[],
  ) {
    return {
      profile: { handle, tier: 23 },
      problems: new Map(
        numbers.map((number) => [
          number,
          { tier: number === 1000 ? 9 : 15, title: null },
        ]),
      ),
    };
  },
};
const solvedAcCredentials = {
  clientId: "fixture",
  clientSecret: "fixture-secret",
};
const openSolvedAcSlot = () =>
  rows("UPDATE boj_tier_provider SET next_at=UTC_TIMESTAMP(3)");

let database: InitializedDatabase;
async function rows(sql: string): Promise<Readonly<Record<string, unknown>>[]> {
  const [result] = await database.rawPool.query<RowDataPacket[]>(sql);
  return result;
}
beforeAll(async () => {
  const config = new BackendConfigLoader().createForTest(process.env);
  database = await initializeDatabase({ ...config, DB_NAME: "boj_bada" });
  // Exercise the live server default. The BOJ SQL session must still interpret TIMESTAMP as UTC.
  await rows("SET GLOBAL time_zone='+09:00'");
  await rows("SET SESSION time_zone='+09:00'");
});
afterAll(async () => {
  try {
    await rows("SET GLOBAL time_zone='+00:00'");
  } finally {
    await database.close();
  }
});

test("serves the imported user from BOJ and reports readiness only after the ingestion migration is recorded", async () => {
  const config = {
    ...new BackendConfigLoader().createForTest(process.env),
    DB_NAME: "boj_bada",
    NODE_ENV: "production" as const,
  };
  const [record] = await rows(
    "SELECT checksum_sha256 FROM jungol_bada.migrations WHERE version=12",
  );
  const checksum = record?.checksum_sha256;
  if (typeof checksum !== "string" || !/^[a-f0-9]{64}$/.test(checksum))
    throw new Error("Expected the real BOJ migration record");
  await rows("DELETE FROM jungol_bada.migrations WHERE version=12");
  try {
    const pending = await bootstrap({ loadConfig: () => config });
    try {
      expect(pending.boj).toBeUndefined();
      expect(
        (
          await pending.app.handle(
            new Request("http://integration.test/health"),
          )
        ).status,
      ).toBe(503);
    } finally {
      await pending.close();
    }
  } finally {
    await rows(`INSERT INTO jungol_bada.migrations(version,filename,checksum_sha256)
      VALUES (12,'012_simplify_boj_ingestion.sql','${checksum}')`);
  }
  const enabled = await bootstrap({ loadConfig: () => config });
  try {
    expect(enabled.boj).toBeDefined();
    const get = (path: string) =>
      enabled.app.handle(new Request(`http://integration.test${path}`));
    expect((await get("/health")).status).toBe(200);
    expect(await (await get("/api/users/41")).json()).toMatchObject({
      success: true,
      data: { id: 41, jungol_name: "alpha", solution: "100", tier: 23 },
    });
    expect(await (await get("/api/user/search?q=alpha")).json()).toMatchObject([
      { id: 41, jungol_name: "alpha" },
    ]);
    expect(await (await get("/api/user/41/problems")).json()).toMatchObject([
      { id: "70", user_id: 41, problem: 1000 },
    ]);
    expect(await (await get("/api/score_history/user/41")).json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 22, bias: 1 })]),
    );
    expect(await (await get("/api/board/user/41/rank-history")).json()).toEqual(
      [expect.objectContaining({ rank: 1 })],
    );
    expect((await get("/api/users/2147483647")).status).toBe(404);
  } finally {
    await enabled.close();
  }
});

test("imports the legacy schema without verdict and preserves cursors, score keys, and UTC instants", async () => {
  expect(
    await rows(
      "SELECT id,handle,CAST(solution AS CHAR) AS committed,CAST(initial_submission_id AS CHAR) AS baseline,tier FROM user WHERE id=41",
    ),
  ).toEqual([
    { id: 41, handle: "alpha", committed: "100", baseline: "100", tier: 23 },
  ]);
  expect(
    await rows(
      "SELECT CAST(id AS CHAR) AS id, DATE_FORMAT(submitted_at,'%Y-%m-%d %H:%i:%s') AS utc, repeatation FROM problem ORDER BY id",
    ),
  ).toEqual([
    { id: "70", utc: "1970-01-01 00:00:01", repeatation: 0 },
    { id: "71", utc: "2026-11-14 00:00:00", repeatation: 1 },
  ]);
  expect(
    await rows(
      "SELECT id,rule_type,award_key,bias FROM score_history ORDER BY id",
    ),
  ).toEqual([
    { id: 21, rule_type: "daily", award_key: "daily:41:2026-11-14", bias: 1 },
    { id: 22, rule_type: "event", award_key: "event:5:41:1000", bias: 1 },
    { id: 23, rule_type: "legacy", award_key: null, bias: -2 },
  ]);
  expect(
    await rows("SELECT COUNT(*) AS total FROM ranked_users WHERE user_id=41"),
  ).toEqual([{ total: "1" }]);
});

test("collects pages, awards once per rule, rolls back a failing member, and replays safely", async () => {
  const alpha = makeMember("alpha", 3, 6);
  const beta = makeMember("beta", 1, 1);
  const delta = makeMember("delta", 2, 2);
  const gamma = makeMember("gamma", 2, 3);
  const first = ac(102, 1001, "2026-11-19T15:00:00Z");
  const pagesRead: string[] = [];
  const errors: string[] = [];
  let baselineCompleted = false;
  await rows(
    "CREATE TRIGGER fail_beta BEFORE INSERT ON score_history FOR EACH ROW BEGIN IF NEW.user_id=42 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture write failure'; END IF; END",
  );
  const projection = new BojRankingProjection(database.pool);
  const generatedRankings: (readonly { handle: string; score: number }[])[] =
    [];
  await rows(
    "INSERT INTO hook (url,ignored) VALUES ('https://example.test/enabled',0),('https://example.test/failing',0)",
  );
  const deliveries: { url: string; content: string }[] = [];
  const notifications = new BojRankingNotifications(database.pool, {
    async send(url, content, sendSignal) {
      expect(sendSignal).toBe(signal);
      expect(
        await rows(
          "SELECT id FROM ranking_boards WHERE title='2026년 11월 랭킹'",
        ),
      ).not.toHaveLength(0);
      deliveries.push({ url, content });
      return !url.endsWith("/failing");
    },
  });
  const runner = new BojCycleRunner(
    database,
    {
      async readGroupMembers(id) {
        expect(id).toBe(13872);
        return [alpha, beta, delta, gamma];
      },
      async readSubmissionPage({ handle, top }: BojSubmissionPageRequest) {
        pagesRead.push(`${handle}:${top}`);
        switch (handle) {
          case "alpha":
            return top === null
              ? {
                  submissions: [
                    {
                      id: bojSubmissionId.parse("105"),
                      verdict: "terminal" as const,
                    },
                    ac(104, 1001, "2026-11-19T15:15:00Z"),
                    ac(103, 1002, "2026-11-19T15:05:00Z"),
                  ],
                  nextTop: bojSubmissionId.parse("102"),
                }
              : {
                  submissions: [
                    first,
                    ac(101, 1000, "2026-11-19T14:59:59Z"),
                    ac(100, 1000, "2026-11-14T00:00:00Z"),
                  ],
                  nextTop: null,
                };
          case "gamma":
            if (top === null && !baselineCompleted)
              return {
                submissions: [ac(301, 1001, "2026-11-19T15:00:00Z")],
                nextTop: bojSubmissionId.parse("300"),
              };
            return {
              submissions: [ac(300, 1002, "2026-11-19T14:00:00Z")],
              nextTop: null,
            };
          default:
            return {
              submissions: [
                ac(handle === "beta" ? 201 : 202, 1001, "2026-11-19T15:00:00Z"),
              ],
              nextTop: null,
            };
        }
      },
    },
    {
      solvedAc: fixtureSolvedAc,
      onMemberFailure: (error) => {
        errors.push(error.name);
      },
      now: () => now,
      async projectRanking(date, cycleSignal) {
        const entries = await projection.rebuild(date);
        if (entries) {
          generatedRankings.push(entries);
          await notifications.send(entries, cycleSignal);
        }
      },
    },
  );
  try {
    expect(await runner.run(signal)).toEqual({
      members: 4,
      processed: 3,
      failed: 1,
      remaining: 0,
    });
  } finally {
    await rows("DROP TRIGGER fail_beta");
  }
  expect(deliveries.map((delivery) => delivery.url).sort()).toEqual([
    "https://example.test/enabled",
    "https://example.test/failing",
  ]);
  expect(deliveries[0]?.content).toContain("`alpha(알파)`: 3 BIA");
  expect(
    await rows(
      "SELECT ignored FROM hook WHERE url='https://example.test/failing'",
    ),
  ).toEqual([{ ignored: 1 }]);
  expect(errors).toHaveLength(1);
  expect(pagesRead).toEqual([
    "alpha:null",
    "alpha:102",
    "beta:null",
    "delta:null",
    "gamma:null",
  ]);
  expect(
    await rows(
      "SELECT handle,CAST(solution AS CHAR) AS committed,baseline_ready FROM user ORDER BY id",
    ),
  ).toEqual([
    { handle: "alpha", committed: "105", baseline_ready: 1 },
    { handle: "beta", committed: "0", baseline_ready: 1 },
    { handle: "delta", committed: "202", baseline_ready: 1 },
    { handle: "gamma", committed: "0", baseline_ready: 0 },
  ]);
  expect(
    await rows(
      "SELECT CAST(external_submission_id AS CHAR) AS attempt,problem_tier,repeatation FROM problem WHERE external_submission_id IS NOT NULL ORDER BY external_submission_id",
    ),
  ).toEqual([
    { attempt: "101", problem_tier: 9, repeatation: 2 },
    { attempt: "102", problem_tier: 15, repeatation: 0 },
    { attempt: "103", problem_tier: 15, repeatation: 0 },
    { attempt: "104", problem_tier: 15, repeatation: 1 },
    { attempt: "202", problem_tier: 15, repeatation: 0 },
  ]);
  expect(
    await rows("SELECT award_key FROM score_history WHERE id>23 ORDER BY id"),
  ).toEqual([
    { award_key: "event:6:41:1000" },
    { award_key: "daily:41:2026-11-20" },
    { award_key: "event:5:41:1001" },
    { award_key: "daily:43:2026-11-20" },
    { award_key: "event:5:43:1001" },
  ]);
  expect(
    await rows("SELECT total_point FROM user_bias_total WHERE user_id=41"),
  ).toEqual([{ total_point: 3 }]);
  expect(await rows("SELECT solved_count_delta FROM user WHERE id=43")).toEqual(
    [{ solved_count_delta: 1 }],
  );
  await rows("UPDATE user SET solution=100,retry_required=1 WHERE id=41");
  baselineCompleted = true;
  expect(await runner.run(signal)).toEqual({
    members: 4,
    processed: 3,
    failed: 0,
    remaining: 0,
  });
  expect(
    await rows("SELECT COUNT(*) AS total FROM score_history WHERE user_id=41"),
  ).toEqual([{ total: "6" }]);
  expect(
    await rows(
      "SELECT CAST(solution AS CHAR) AS committed,baseline_ready FROM user WHERE handle='gamma'",
    ),
  ).toEqual([{ committed: "301", baseline_ready: 1 }]);
  expect(
    await rows(
      "SELECT COUNT(*) AS total FROM score_history s JOIN user u ON u.id=s.user_id WHERE u.handle='gamma'",
    ),
  ).toEqual([{ total: "0" }]);
  expect(generatedRankings[0]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ handle: "alpha", score: 3 }),
      expect.objectContaining({ handle: "delta", score: 2 }),
    ]),
  );
  expect(await projection.rebuild(now)).toBeNull();
  expect(deliveries.filter(({ url }) => url.endsWith("/failing"))).toHaveLength(
    1,
  );
  const config = {
    ...new BackendConfigLoader().createForTest(process.env),
    DB_NAME: "boj_bada",
  };
  const reader = await bootstrap({
    loadConfig: () => config,
    clock: { now: () => now },
  });
  try {
    const get = (path: string) =>
      reader.app.handle(new Request(`http://integration.test${path}`));
    expect(await (await get("/api/users/41")).json()).toMatchObject({
      data: { id: 41, solution: "105", corrects: 3 },
    });
    expect(await (await get("/api/user/41/problems")).json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          external_submission_id: "102",
          problem: 1001,
        }),
      ]),
    );
    expect(await (await get("/api/score_history/user/41")).json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          display_name: "alpha",
          event_id: 5,
          bias: 1,
        }),
      ]),
    );
    expect(
      await (await get("/api/user/41/monthly-summary")).json(),
    ).toMatchObject({
      data: { total_solved: 2, total_score: 3 },
    });
  } finally {
    await reader.close();
  }
  const settlement = new BojMemberSettlement(database.pool);
  const snapshot = await fixtureSolvedAc.readTiers("alpha", null, [1001]);
  await expect(
    settlement.commit(
      {
        member: alpha,
        expectedCursor: bojSubmissionCursor.parse("100"),
        committedThrough: first.id,
        accepted: [first],
        retryRequired: false,
      },
      snapshot,
      now,
    ),
  ).rejects.toThrow("cursor_changed");
  const collision = ac(105, 1001, "2026-11-19T15:00:00Z");
  await rows(
    "UPDATE problem SET external_submission_id=105 WHERE external_submission_id=201",
  );
  await rows("UPDATE user SET solution=104 WHERE id=41");
  await expect(
    settlement.commit(
      {
        member: alpha,
        expectedCursor: bojSubmissionCursor.parse("104"),
        committedThrough: collision.id,
        accepted: [collision],
        retryRequired: false,
      },
      snapshot,
      now,
    ),
  ).rejects.toThrow("submission_owner_changed");
  expect(
    await rows(
      "SELECT CAST(solution AS CHAR) AS committed FROM user WHERE id=41",
    ),
  ).toEqual([{ committed: "104" }]);
});

test("keeps a new member's initial boundary while the first submission is being judged", async () => {
  const initial = ac(400, 1002, "2026-11-19T15:00:00Z");
  let pageCount = 0;
  const runner = new BojCycleRunner(
    database,
    {
      async readGroupMembers() {
        return [makeMember("epsilon", 1, 1)];
      },
      async readSubmissionPage({ top }) {
        pageCount += 1;
        if (pageCount === 1) {
          expect(top).toBeNull();
          return {
            submissions: [{ id: initial.id, verdict: "pending" as const }],
            nextTop: null,
          };
        }
        expect(top).toBe(initial.id);
        return { submissions: [initial], nextTop: null };
      },
    },
    {
      solvedAc: fixtureSolvedAc,
      onMemberFailure: () => {},
      now: () => now,
    },
  );
  expect((await runner.run(signal))?.failed).toBe(0);
  expect(
    await rows(
      "SELECT CAST(initial_submission_id AS CHAR) AS baseline,baseline_ready FROM user WHERE handle='epsilon'",
    ),
  ).toEqual([{ baseline: "400", baseline_ready: 0 }]);
  expect((await runner.run(signal))?.failed).toBe(0);
  expect(
    await rows(
      "SELECT CAST(solution AS CHAR) AS committed,baseline_ready FROM user WHERE handle='epsilon'",
    ),
  ).toEqual([{ committed: "400", baseline_ready: 1 }]);
  expect(
    await rows(
      "SELECT COUNT(*) AS total FROM score_history s JOIN user u ON u.id=s.user_id WHERE u.handle='epsilon'",
    ),
  ).toEqual([{ total: "0" }]);
});

test("uses current solved.ac tiers and leaves submissions and awards unchanged on provider failures", async () => {
  await rows(
    "INSERT INTO user (handle,solution,initial_submission_id,tier) VALUES ('fresh_tier_member',800,800,5)",
  );
  const member = makeMember("fresh_tier_member", 1, 1);
  let requested: string[] = [];
  let status = 429;
  let failurePath = "/api/v4/problems/";
  let level = 1;
  let tier = 23;
  let accepted = ac(801, 9600, "2026-11-19T15:00:00Z");
  const solvedAc = new SolvedAcCollector(database, {
    credentials: solvedAcCredentials,
    async request(url) {
      requested.push(url.pathname);
      if (status && url.pathname.startsWith(failurePath))
        return new Response(null, {
          status,
          headers: { "Retry-After": "120" },
        });
      if (url.pathname.startsWith("/api/v4/users/"))
        return Response.json({
          handle: member.handle,
          tier,
          ojAccounts: [{ ojId: "boj", handle: member.handle }],
        });
      return Response.json({
        level,
        judgeIds: [{ ojId: "boj", problemId: "9600" }],
        titles: [{ language: "ko", title: "현재 티어" }],
      });
    },
  });
  const failures: unknown[] = [];
  const runner = new BojCycleRunner(
    database,
    {
      async readGroupMembers() {
        return [member];
      },
      async readSubmissionPage() {
        return { submissions: [accepted], nextTop: null };
      },
    },
    {
      solvedAc,
      onMemberFailure: (error) => {
        failures.push(error);
      },
      now: () => now,
    },
  );
  const saved = () =>
    rows(`SELECT u.tier,CAST(u.solution AS CHAR) AS committed,
      (SELECT COUNT(*) FROM problem WHERE user_id=u.id) AS solves,
      (SELECT COUNT(*) FROM score_history WHERE user_id=u.id) AS awards
      FROM user u WHERE handle='${member.handle}'`);
  await openSolvedAcSlot();
  expect((await runner.run(signal))?.failed).toBe(1);
  expect(failures[0]).toMatchObject({ reason: "cooldown" });
  expect(
    await rows(
      "SELECT IF(next_at>UTC_TIMESTAMP(3)+INTERVAL 110 SECOND,1,0) AS cooldown FROM boj_tier_provider",
    ),
  ).toEqual([{ cooldown: "1" }]);
  expect((await runner.run(signal))?.failed).toBe(1);
  expect(requested).toHaveLength(2);
  expect(await saved()).toEqual([
    { tier: 5, committed: "800", solves: "0", awards: "0" },
  ]);

  status = 403;
  failurePath = "/api/v4/users/";
  await openSolvedAcSlot();
  expect((await runner.run(signal))?.failed).toBe(1);
  expect(failures[failures.length - 1]).toMatchObject({ reason: "blocked" });
  expect(
    await rows(
      "SELECT blocked,IF(next_at>UTC_TIMESTAMP(3)+INTERVAL 23 HOUR,1,0) AS cooldown FROM boj_tier_provider",
    ),
  ).toEqual([{ blocked: 1, cooldown: "1" }]);
  expect(await saved()).toEqual([
    { tier: 5, committed: "800", solves: "0", awards: "0" },
  ]);

  status = 0;
  await openSolvedAcSlot();
  requested = [];
  expect((await runner.run(signal))?.failed).toBe(0);
  expect(requested).toEqual([
    "/api/v4/users/fresh_tier_member",
    "/api/v4/problems/9600",
  ]);
  expect(await saved()).toEqual([
    { tier: 23, committed: "801", solves: "1", awards: "0" },
  ]);
  expect(await rows("SELECT blocked FROM boj_tier_provider")).toEqual([
    { blocked: 0 },
  ]);

  tier = 19;
  level = 20;
  accepted = ac(802, 9600, "2026-11-20T15:00:00Z");
  await rows(
    "UPDATE user SET retry_required=1 WHERE handle='fresh_tier_member'",
  );
  await openSolvedAcSlot();
  expect((await runner.run(signal))?.failed).toBe(0);
  expect(requested).toEqual([
    "/api/v4/users/fresh_tier_member",
    "/api/v4/problems/9600",
    "/api/v4/users/fresh_tier_member",
    "/api/v4/problems/9600",
  ]);
  expect(await saved()).toEqual([
    { tier: 19, committed: "802", solves: "2", awards: "0" },
  ]);
  expect(
    await rows(
      "SELECT problem_tier,level FROM problem WHERE external_submission_id IN (801,802) ORDER BY external_submission_id",
    ),
  ).toEqual([
    { problem_tier: 1, level: -22 },
    { problem_tier: 20, level: 1 },
  ]);
});

test("resumes paginated solved.ac history under the shared limit without changing submissions or scores", async () => {
  let hasBojHistory = false;
  const runner = new BojCycleRunner(
    database,
    {
      async readGroupMembers() {
        return [makeMember("new_boj_user", 55, 88)];
      },
      async readSubmissionPage() {
        return {
          submissions: hasBojHistory
            ? [ac(700, 1000, "2026-11-20T00:00:00Z")]
            : [],
          nextTop: null,
        };
      },
    },
    {
      solvedAc: fixtureSolvedAc,
      onMemberFailure: () => {},
      now: () => now,
    },
  );
  await runner.run(signal);
  await rows(
    "UPDATE user SET solved_ac_history_next_at=UTC_TIMESTAMP(3)+INTERVAL 1 HOUR WHERE solved_ac_history_page IS NOT NULL AND handle<>'new_boj_user'",
  );
  expect(
    await rows(
      "SELECT CAST(solution AS CHAR) AS committed,baseline_ready FROM user WHERE handle='new_boj_user'",
    ),
  ).toEqual([{ committed: "0", baseline_ready: 0 }]);
  const requests: string[] = [];
  const item = (problemId: number) => ({
    problemId: problemId + 30000,
    level: 9.5,
    titles: [{ language: "ko", title: "기존 풀이" }],
    judgeIds: [{ ojId: "boj", problemId: String(problemId) }],
  });
  const client = new SolvedAcClient(
    { clientId: "fixture", clientSecret: "fixture-secret" },
    async (url, request) => {
      expect(new Headers(request.headers).get("x-client-secret")).toBe(
        "fixture-secret",
      );
      if (url.pathname === "/api/v4/users/new_boj_user") {
        requests.push("profile");
        return Response.json({
          handle: "solved-alias",
          tier: 12,
          ojAccounts: [{ ojId: "boj", handle: "new_boj_user" }],
        });
      }
      expect(url.pathname).toBe("/api/v4/problems");
      expect(url.searchParams.get("q")).toBe("solved_by:solved-alias");
      expect(url.searchParams.get("sort")).toBe("id");
      const page = Number(url.searchParams.get("page"));
      requests.push(String(page));
      if (
        page === 2 &&
        requests.filter((request) => request === "2").length === 1
      )
        return new Response("", {
          status: 429,
          headers: { "Retry-After": "120" },
        });
      const problems =
        page === 1
          ? [
              item(1000),
              ...Array.from({ length: 49 }, (_, index) => item(2000 + index)),
            ]
          : [
              item(3100),
              {
                ...item(3000),
                judgeIds: [
                  { ojId: "boj", problemId: "3000" },
                  { ojId: "doj", problemId: "10" },
                ],
              },
            ];
      return Response.json({
        problems,
        total: 52,
        page,
        pageSize: 50,
        diagnostics: [],
      });
    },
  );
  const resetClock = async () => {
    await rows(
      "UPDATE user SET solved_ac_history_next_at=UTC_TIMESTAMP(3) WHERE handle='new_boj_user'",
    );
    await rows("UPDATE boj_tier_provider SET next_at=UTC_TIMESTAMP(3)");
  };
  const runHistory = () =>
    withBojLease(database.rawPool, "boj_bada:solved-ac", () =>
      new BojSolvedHistory(database.pool, client).refreshOne(signal),
    );
  await resetClock();
  expect(await runHistory()).toBe("processed");
  expect(await runHistory()).toBe("idle");
  await resetClock();
  expect(await runHistory()).toBe("processed");
  await resetClock();
  expect(await runHistory()).toBe("processed");
  expect(await runHistory()).toBe("idle");
  expect(
    await rows(
      "SELECT solved_ac_history_page AS next_page FROM user WHERE handle='new_boj_user'",
    ),
  ).toEqual([{ next_page: 2 }]);
  await resetClock();
  expect(await runHistory()).toBe("processed");
  expect(requests).toEqual(["profile", "1", "2", "2"]);
  expect(
    await rows(
      "SELECT solved_ac_history_page AS next_page FROM user WHERE handle='new_boj_user'",
    ),
  ).toEqual([{ next_page: null }]);
  expect(
    await rows(
      "SELECT COUNT(*) AS total FROM problem p JOIN user u ON u.id=p.user_id WHERE u.handle='new_boj_user' AND p.external_submission_id IS NULL",
    ),
  ).toEqual([{ total: "51" }]);
  expect(
    await rows(
      "SELECT p.problem,p.problem_name,p.problem_tier FROM problem p JOIN user u ON u.id=p.user_id WHERE u.handle='new_boj_user' AND p.problem=2000",
    ),
  ).toEqual([{ problem: 2000, problem_name: "기존 풀이", problem_tier: 9 }]);
  expect(
    await rows(
      "SELECT tier,solved_ac_handle FROM user WHERE handle='new_boj_user'",
    ),
  ).toEqual([{ tier: 12, solved_ac_handle: "solved-alias" }]);
  expect(
    await rows(
      "SELECT CAST(solution AS CHAR) AS committed FROM user WHERE handle='new_boj_user'",
    ),
  ).toEqual([{ committed: "0" }]);
  hasBojHistory = true;
  await runner.run(signal);
  expect(
    await rows(
      "SELECT CAST(solution AS CHAR) AS committed,baseline_ready FROM user WHERE handle='new_boj_user'",
    ),
  ).toEqual([{ committed: "700", baseline_ready: 1 }]);
  expect(
    await rows(
      "SELECT COUNT(*) AS total FROM score_history s JOIN user u ON u.id=s.user_id WHERE u.handle='new_boj_user'",
    ),
  ).toEqual([{ total: "0" }]);
});

test("skips unlinked group handles and rediscovers them from the roster after restart", async () => {
  let registered = false;
  const members = [makeMember("probe_boj_member", 0, 0)];
  const checked: string[] = [];
  let pages = 0;
  const checkProfile = async (handle: string) => {
    checked.push(handle);
    return registered
      ? { kind: "resolved" as const, handle: "Alias_User" }
      : { kind: "missing" as const };
  };
  const reader = {
    async readGroupMembers() {
      return members;
    },
    async readSubmissionPage() {
      pages += 1;
      return { submissions: [], nextTop: null };
    },
  };
  const local = (solvedAc: SolvedAcCollector) =>
    new BojCycleRunner(database, reader, {
      solvedAc,
      onMemberFailure: () => {},
      now: () => now,
    });
  const first = new SolvedAcCollector(database, { checkProfile });
  const firstCycle = local(first);
  await firstCycle.run(signal);
  expect(checked).toEqual([]);
  await openSolvedAcSlot();
  await first.refreshOne(signal);
  await firstCycle.run(signal);
  expect(checked).toEqual(["probe_boj_member"]);
  expect(pages).toBe(0);
  expect(
    await rows("SELECT handle FROM user WHERE handle='probe_boj_member'"),
  ).toEqual([]);

  registered = true;
  const restarted = new SolvedAcCollector(database, { checkProfile });
  const nextCycle = local(restarted);
  await nextCycle.run(signal);
  await openSolvedAcSlot();
  await restarted.refreshOne(signal);
  await nextCycle.run(signal);
  expect(checked).toEqual(["probe_boj_member", "probe_boj_member"]);
  expect(pages).toBe(1);
  expect(
    await rows(
      "SELECT solved_ac_handle,solved_ac_history_page,baseline_ready FROM user WHERE handle='probe_boj_member'",
    ),
  ).toEqual([
    {
      solved_ac_handle: "Alias_User",
      solved_ac_history_page: 0,
      baseline_ready: 1,
    },
  ]);

  expect(restarted.observe([]).size).toBe(0);
});

test("shares a two-second slot across the browser, history API, and live tier lookup", async () => {
  await rows(
    "UPDATE user SET solved_ac_history_next_at=UTC_TIMESTAMP(3)+INTERVAL 1 HOUR WHERE solved_ac_history_page IS NOT NULL",
  );
  await rows(
    "UPDATE user SET solved_ac_history_page=1,solved_ac_history_next_at=UTC_TIMESTAMP(3) WHERE handle='probe_boj_member'",
  );
  await openSolvedAcSlot();
  const calls: string[] = [];
  const requestTimes: number[] = [];
  const record = (label: string) => {
    calls.push(label);
    requestTimes.push(performance.now());
  };
  const options = {
    credentials: solvedAcCredentials,
    async checkProfile() {
      record("browser");
      return { kind: "resolved" as const, handle: "queued_user" };
    },
    async request(url: URL) {
      record(url.pathname);
      if (url.pathname === "/api/v4/problems")
        return Response.json({ page: 1, pageSize: 50, total: 0, problems: [] });
      if (url.pathname === "/api/v4/users/Alias_User")
        return Response.json({
          handle: "Alias_User",
          tier: 20,
          ojAccounts: [{ ojId: "boj", handle: "probe_boj_member" }],
        });
      return Response.json({
        level: 10,
        judgeIds: [{ ojId: "boj", problemId: "95011" }],
        titles: [],
      });
    },
  };
  const collector = new SolvedAcCollector(database, options);
  collector.observe(["queued_user"]);
  await collector.refreshOne(signal);
  // A newly constructed collector is subject to the same reservation.
  const restarted = new SolvedAcCollector(database, options);
  await restarted.refreshOne(signal);
  expect(calls).toEqual(["browser"]);
  expect(
    await rows(
      "SELECT IF(next_at>=UTC_TIMESTAMP(3)+INTERVAL 1 SECOND,1,0) AS reserved FROM boj_tier_provider",
    ),
  ).toEqual([{ reserved: "1" }]);
  await Bun.sleep(2_015);
  await restarted.refreshOne(signal);
  const reading = restarted.readTiers(
    "probe_boj_member",
    "Alias_User",
    [95011, 95011],
    signal,
  );
  expect(await reading).toMatchObject({
    profile: { handle: "Alias_User", tier: 20 },
    problems: new Map([[95011, { tier: 10, title: null }]]),
  });
  expect(calls).toEqual([
    "browser",
    "/api/v4/problems",
    "/api/v4/users/Alias_User",
    "/api/v4/problems/95011",
  ]);
  for (let index = 1; index < requestTimes.length; index += 1)
    expect(
      (requestTimes[index] ?? 0) - (requestTimes[index - 1] ?? 0),
    ).toBeGreaterThanOrEqual(1_995);
});

test("sends collector failures through the configured webhook without alerting on rate limits", async () => {
  await rows(
    "UPDATE user SET corrects=4,submissions=6,retry_required=0,last_checked_at=UTC_TIMESTAMP(3) WHERE handle='alpha'",
  );
  await rows(
    "UPDATE user SET solved_ac_history_next_at=UTC_TIMESTAMP(3)+INTERVAL 1 HOUR WHERE solved_ac_history_page IS NOT NULL",
  );
  await rows(
    "UPDATE user SET solved_ac_history_page=0,solved_ac_history_next_at=UTC_TIMESTAMP(3) WHERE handle='alpha'",
  );
  await openSolvedAcSlot();

  const received: string[] = [];
  const sink = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      expect(request.method).toBe("POST");
      received.push((await request.json()).content);
      return new Response(null, { status: 204 });
    },
  });
  let stage: "broken_rank" | "rate_limit" | "blocked_api" | "broken_member" =
    "broken_rank";
  let time = 0;
  const app = await bootstrap({
    loadConfig: () => ({
      ...new BackendConfigLoader().createForTest(process.env),
      DB_NAME: "boj_bada",
      WEBHOOK_URL: sink.url.href,
      SOLVED_AC_CLIENT_ID: "fixture",
      SOLVED_AC_CLIENT_SECRET: "fixture-secret",
    }),
    bojSources: {
      boj: new BojPageReader({
        monotonicNow: () => time,
        wait: async (ms) => {
          time += ms;
        },
        async request(url) {
          if (stage === "rate_limit")
            return new Response(null, { status: 429 });
          const body =
            stage === "broken_rank" || url.pathname === "/status"
              ? "<h1>fixture HTML must stay out of alerts</h1>"
              : `<table id="ranklist"><thead><tr><th>아이디</th><th>맞은 문제</th><th>제출</th></tr></thead>
                <tbody><tr><td><a href="/user/alpha">alpha</a></td><td>4</td><td>${stage === "broken_member" ? 7 : 6}</td></tr></tbody></table>`;
          return new Response(body, {
            headers: { "Content-Type": "text/html" },
          });
        },
      }),
      solvedAc: {
        async request(url) {
          expect(url.pathname).toBe("/api/v4/users/alpha");
          return new Response(null, { status: 403 });
        },
      },
    },
  });
  try {
    const boj = app.boj;
    if (!boj) throw new Error("BOJ runtime did not start");
    await expect(boj.runOnce(signal)).rejects.toMatchObject({
      reason: "missing_table",
    });
    await expect(boj.runOnce(signal)).rejects.toMatchObject({
      reason: "missing_table",
    });
    stage = "rate_limit";
    await expect(boj.runOnce(signal)).rejects.toMatchObject({ status: 429 });
    stage = "blocked_api";
    expect((await boj.runOnce(signal))?.failed).toBe(0);
    stage = "broken_member";
    expect((await boj.runOnce(signal))?.failed).toBe(1);
    expect(received).toHaveLength(3);
    expect(received[0]).toContain("`boj.cycle_failed`");
    expect(received[1]).toContain("`solved_ac_access_blocked`");
    expect(received[2]).toContain("`boj.member_failed`");
    expect(received.join("\n")).not.toContain("fixture HTML");
  } finally {
    try {
      await app.close();
    } finally {
      sink.stop(true);
    }
  }
});

test("awards one daily point per KST day and one point for each eligible event and problem", async () => {
  const handle = "scoring_scenario";
  const member = makeMember(handle, 6, 7);
  const day = "2026-11-20";
  const nextDay = "2026-11-21";
  const epoch = (time: string) => Date.parse(`${day}T${time}Z`) / 1000;
  const begin = epoch("14:00:00");
  const end = epoch("16:00:00");
  const expired = epoch("14:59:00");
  const addedLate = epoch("15:00:00");
  await rows(
    "INSERT INTO user (handle,solution,initial_submission_id,tier) VALUES ('scoring_scenario',9000,9000,20)",
  );
  await rows(`INSERT INTO event (id,\`begin\`,\`end\`,title,created_at) VALUES
    (9101,FROM_UNIXTIME(${begin}),FROM_UNIXTIME(${end}),'First event',FROM_UNIXTIME(${begin})),
    (9102,FROM_UNIXTIME(${begin}),FROM_UNIXTIME(${end}),'Second event',FROM_UNIXTIME(${begin})),
    (9103,FROM_UNIXTIME(${begin}),FROM_UNIXTIME(${expired}),'Expired event',FROM_UNIXTIME(${begin})),
    (9104,FROM_UNIXTIME(${begin}),FROM_UNIXTIME(${end}),'Problem added late',FROM_UNIXTIME(${begin}))`);
  await rows(`INSERT INTO event_problem (event_id,problem,added_at) VALUES
    (9101,9800,FROM_UNIXTIME(${begin})),(9101,9802,FROM_UNIXTIME(${begin})),
    (9101,9803,FROM_UNIXTIME(${begin})),
    (9102,9800,FROM_UNIXTIME(${begin})),(9103,9801,FROM_UNIXTIME(${begin})),
    (9104,9801,FROM_UNIXTIME(${addedLate}))`);
  await rows(`INSERT INTO problem (user_id,problem,problem_tier,submitted_at,level,repeatation,solved_ac_observed_at)
    SELECT id,9805,15,'1970-01-01 00:00:01',-5,0,'2026-11-20 14:50:00' FROM user WHERE handle='scoring_scenario'`);

  const accepted = [
    ac(9001, 9800, `${day}T14:58:00Z`),
    ac(9002, 9801, `${day}T14:59:00Z`),
    ac(9003, 9800, `${day}T15:00:00Z`),
    ac(9004, 9805, `${day}T15:00:30Z`),
    ac(9005, 9802, `${day}T15:01:00Z`),
    ac(9006, 9803, `${day}T15:02:00Z`),
    ac(9007, 9804, `${day}T15:03:00Z`),
  ];
  const settlement = new BojMemberSettlement(database.pool);
  const input = {
    member,
    expectedCursor: bojSubmissionCursor.parse("9000"),
    committedThrough: bojSubmissionCursor.parse("9007"),
    accepted,
    retryRequired: false,
  };
  const tiers = {
    profile: { tier: 20, handle },
    problems: new Map(
      accepted.map(({ problemNumber }) => [
        problemNumber,
        { tier: problemNumber === 9802 ? 2 : 15, title: null },
      ]),
    ),
  };
  const settledAt = new Date(`${day}T15:10:00Z`);
  expect(await settlement.commit(input, tiers, settledAt)).toBe(7);
  await expect(
    settlement.commit(input, tiers, settledAt),
  ).rejects.toMatchObject({
    reason: "cursor_changed",
  });

  expect(
    await rows(`SELECT DATE_FORMAT(s.score_day,'%Y-%m-%d') AS day, s.rule_type, s.event_id, p.problem, s.bias
    FROM score_history s JOIN user u ON u.id=s.user_id JOIN problem p ON p.id=s.problem_id
    WHERE u.handle='scoring_scenario' ORDER BY s.score_day,p.problem,s.rule_type,s.event_id`),
  ).toEqual([
    { day, rule_type: "daily", event_id: null, problem: 9800, bias: 1 },
    { day, rule_type: "event", event_id: 9101, problem: 9800, bias: 1 },
    { day, rule_type: "event", event_id: 9102, problem: 9800, bias: 1 },
    {
      day: nextDay,
      rule_type: "event",
      event_id: 9101,
      problem: 9802,
      bias: 1,
    },
    {
      day: nextDay,
      rule_type: "daily",
      event_id: null,
      problem: 9803,
      bias: 1,
    },
    {
      day: nextDay,
      rule_type: "event",
      event_id: 9101,
      problem: 9803,
      bias: 1,
    },
  ]);
  expect(
    await rows(`SELECT CAST(external_submission_id AS CHAR) AS submission,repeatation
    FROM problem WHERE external_submission_id IN (9001,9003,9004) ORDER BY external_submission_id`),
  ).toEqual([
    { submission: "9001", repeatation: 0 },
    { submission: "9003", repeatation: 1 },
    { submission: "9004", repeatation: 1 },
  ]);
  expect(
    await rows(`SELECT total_point FROM user_bias_total t JOIN user u ON u.id=t.user_id
    WHERE u.handle='scoring_scenario'`),
  ).toEqual([{ total_point: 6 }]);
});

test("serves the admin queries from the migrated BOJ schema and writes only to it", async () => {
  const config = {
    ...new BackendConfigLoader().createForTest(process.env),
    DB_NAME: "boj_bada",
  };
  let currentTime = now;
  const app = await bootstrap({
    loadConfig: () => config,
    clock: { now: () => currentTime },
  });
  await rows(
    "INSERT INTO solved_ac_accounts(solved_ac_id,user_id,solved_ac_handle) VALUES(871,41,'alpha')",
  );
  await rows("INSERT INTO admin_users(user_id) VALUES(41)");
  const session = jwt.sign({ solvedAcId: "871" }, config.JWT_SECRET, {
    algorithm: "HS256",
    subject: "41",
    issuer: "anabada",
    audience: "anabada-web",
    expiresIn: 3600,
  });
  const request = (
    path: string,
    method = "GET",
    body?: object,
    authorized = true,
  ) =>
    app.app.handle(
      new Request(`http://integration.test${path}`, {
        method,
        headers: {
          ...(authorized
            ? {
                cookie: `anabada_session=${session}`,
                origin: config.ALLOWED_ORIGIN,
              }
            : {}),
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  const get = async (path: string) => {
    const response = await request(path);
    expect(response.status).toBe(200);
    return response.json();
  };
  const reason = "관리자 백준 점수 테스트";
  try {
    for (const path of [
      "/api/users/all",
      "/api/admin/score-history",
      "/api/bias/all",
      "/api/hooks",
      "/api/admin/ranking-boards",
    ]) {
      expect((await request(path, "GET", undefined, false)).status).toBe(401);
    }
    expect(await get("/api/users/all")).toMatchObject({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({ id: 41, jungol_name: "alpha" }),
      ]),
    });
    const instant = now.getTime() / 1000;
    await rows(`INSERT INTO event (id,\`begin\`,\`end\`,title,created_at) VALUES
      (9201,FROM_UNIXTIME(${instant}),FROM_UNIXTIME(${instant}+3600),'Just started',FROM_UNIXTIME(${instant})),
      (9202,FROM_UNIXTIME(${instant}-3600),FROM_UNIXTIME(${instant}),'Just ended',FROM_UNIXTIME(${instant})),
      (9203,FROM_UNIXTIME(${instant}+1),FROM_UNIXTIME(${instant}+3600),'Not started',FROM_UNIXTIME(${instant}))`);
    const active = await get("/api/events?status=active&limit=1");
    expect(active).toMatchObject({
      pagination: { page: 1, limit: 1, total: 3, total_pages: 3 },
      data: [{ id: 9201, title: "Just started", problem_count: 0 }],
    });
    const secondPage = await get("/api/events?status=active&limit=2&page=2");
    expect(secondPage).toMatchObject({
      pagination: { total: 3 },
      data: [{ id: 5 }],
    });

    expect(
      (await request("/api/users/41", "PUT", { korean_name: "관리자 검증" }))
        .status,
    ).toBe(200);
    expect(
      await rows("SELECT korean_name FROM boj_bada.user WHERE id=41"),
    ).toEqual([{ korean_name: "관리자 검증" }]);
    expect(await rows("SELECT kr_name FROM anabada.user WHERE id=41")).toEqual([
      { kr_name: "알파" },
    ]);

    currentTime = new Date();
    await rows(
      "INSERT INTO boj_bada.user (id,handle) VALUES (9401,'admin_sql_probe')",
    );
    const added = await request("/api/score-history/bulk", "POST", {
      records: [
        {
          user_id: 9401,
          bias: 4,
          desc: reason,
          event_id: null,
          problem_id: null,
        },
      ],
    });
    expect(added.status).toBe(200);
    expect(await added.json()).toMatchObject({ insertedCount: 1, failed: [] });
    const log = await get(
      "/api/admin/score-history?username=admin_sql_probe&limit=1",
    );
    expect(log.data).toMatchObject([
      { user_id: 9401, desc: reason, bias: 4, rule_type: "custom" },
    ]);
    expect(await get("/api/bias/all")).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          user_id: 9401,
          jungol_name: "admin_sql_probe",
          total_point: 4,
        }),
      ]),
    });
    expect(
      await rows(
        "SELECT COUNT(*) AS total FROM anabada.score_history WHERE user_id=9401",
      ),
    ).toEqual([{ total: "0" }]);
    expect(
      (await request(`/api/score-history/${log.data[0].id}`, "DELETE")).status,
    ).toBe(200);
    expect(
      await rows(
        "SELECT COUNT(*) AS total FROM boj_bada.score_history WHERE user_id=9401",
      ),
    ).toEqual([{ total: "0" }]);
    expect(await get("/api/hooks")).toMatchObject({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({ url: "https://example.test/legacy-hook" }),
      ]),
    });
    expect(await get("/api/admin/ranking-boards")).toMatchObject({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({ title: "기존 순위" }),
      ]),
    });
  } finally {
    await rows("DELETE FROM admin_users WHERE user_id=41");
    await rows("DELETE FROM solved_ac_accounts WHERE solved_ac_id=871");
    await app.close();
  }
});
