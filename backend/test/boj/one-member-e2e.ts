import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { BojPageReader } from "../../src/boj/page-reader.js";
import { checkSolvedProfile } from "../../src/boj/solved-profile-browser.js";
import { bootstrap } from "../../src/bootstrap.js";
import { BackendConfigLoader } from "../../src/config/backend-config.js";
import { initializeDatabase } from "../../src/infrastructure/mysql/pool-factory.js";

const handle = "e2e_member";
const eventProblem = 2000;
const eventTitle = "E2E 한 명 이벤트";
const requestPaths: string[] = [];
const oldTime = Math.floor(Date.now() / 1000) - 86_400;
let newTime: number | undefined;

function attempt(id: number, number: number, timestamp: number, result = "ac") {
  return `<tr id="solution-${id}"><td>${id}</td><td><a href="/user/${handle}">${handle}</a></td>
    <td><a href="/problem/${number}">${number}</a></td><td><span class="result-${result}">채점 결과</span></td>
    <td><a data-timestamp="${timestamp}">제출 시각</a></td></tr>`;
}

const html = (body: string) =>
  new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
const problem = (number: number, title: string) => ({
  level: 15,
  judgeIds: [{ ojId: "boj", problemId: String(number) }],
  titles: [{ language: "ko", title }],
});

const upstream = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const { pathname, search, searchParams } = new URL(request.url);
    requestPaths.push(`${pathname}${search}`);
    if (pathname === "/group/ranklist/13872/1")
      return html(`<table id="ranklist"><thead><tr><th>아이디</th><th>맞은 문제</th><th>제출</th></tr></thead>
        <tbody><tr><td><a href="/user/${handle}">${handle}</a></td><td>${newTime ? 3 : 2}</td><td>${newTime ? 4 : 2}</td></tr></tbody></table>`);
    if (pathname === `/ko/u/${handle}`)
      return html(
        `<h2>${handle}</h2><a href="https://www.acmicpc.net/user/${handle}">Baekjoon ${handle}</a>`,
      );
    if (pathname === "/status" && searchParams.get("user_id") === handle) {
      const submittedAt = searchParams.has("top") ? undefined : newTime;
      const attempts =
        submittedAt !== undefined
          ? attempt(103, eventProblem, submittedAt, "wa") +
            attempt(102, eventProblem, submittedAt)
          : attempt(100, 1000, oldTime);
      const next =
        submittedAt !== undefined
          ? `<a href="/status?user_id=${handle}&amp;top=100">다음</a>`
          : "";
      return html(`<table id="status-table"><thead><tr><th>제출 번호</th><th>아이디</th><th>문제</th><th>결과</th><th>제출한 시간</th></tr></thead>
        <tbody>${attempts}</tbody></table>${next}`);
    }
    if (pathname === `/api/v4/users/${handle}`)
      return Response.json({
        handle,
        tier: 15,
        ojAccounts: [{ ojId: "boj", handle }],
      });
    if (
      pathname === "/api/v4/problems" &&
      searchParams.get("q") === `solved_by:${handle}`
    )
      return Response.json({
        page: 1,
        pageSize: 50,
        total: 3,
        problems: [
          problem(1000, "초기 백준 풀이"),
          problem(1500, "solved.ac 과거 풀이"),
          problem(eventProblem, "E2E 신규 정답"),
        ],
      });
    if (pathname === `/api/v4/problems/${eventProblem}`)
      return Response.json(problem(eventProblem, "E2E 신규 정답"));
    return new Response("Unexpected fixture request", { status: 502 });
  },
});

const config = new BackendConfigLoader().load({
  ...process.env,
  SOLVED_AC_CLIENT_ID: "fixture",
  SOLVED_AC_CLIENT_SECRET: "fixture-secret",
});
assert.equal(config.NODE_ENV, "test");
assert.equal(config.DB_NAME, "boj_bada");
const database = await initializeDatabase(config);
const sourceRequest = (url: URL, init: RequestInit) =>
  fetch(new URL(url.pathname + url.search, upstream.url), init);
const { app, boj, close } = await bootstrap({
  loadConfig: () => config,
  initializeDatabase: async () => database,
  bojSources: {
    boj: new BojPageReader({
      request: (url, signal) => sourceRequest(url, { signal }),
    }),
    solvedAc: {
      checkProfile: (handle, signal) =>
        checkSolvedProfile(handle, signal, upstream.url.origin),
      request: sourceRequest,
    },
  },
});
const search = () =>
  app.handle(new Request(`http://test.local/api/user/search?q=${handle}`));
const signal = AbortSignal.timeout(110_000);
try {
  assert.ok(boj, "BOJ ingestion migration is missing");
  const runCycle = async () => {
    const result = await boj.runOnce(signal);
    assert.equal(result?.failed, 0);
  };
  const [initialRows] = await database.rawPool.query(
    "SELECT (SELECT COUNT(*) FROM user) AS users,(SELECT COUNT(*) FROM problem) AS problems,(SELECT COUNT(*) FROM score_history) AS scores",
  );
  assert.deepEqual(initialRows, [{ users: "0", problems: "0", scores: "0" }]);
  assert.deepEqual(await (await search()).json(), []);
  console.log("E2E: zero users, problems, and score rows");

  const kst = (offset: number) =>
    new Date(Date.now() + offset + 9 * 3_600_000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
  const event = await app.handle(
    new Request("http://test.local/api/event/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `accessToken=${encodeURIComponent(`Bearer ${jwt.sign({ role: "admin" }, config.JWT_SECRET)}`)}`,
      },
      body: JSON.stringify({
        title: eventTitle,
        begin: kst(-3_600_000),
        end: kst(3_600_000),
        problems: [eventProblem],
      }),
    }),
  );
  assert.equal(event.status, 200);
  assert.equal((await event.json()).success, true);

  await runCycle();
  assert.deepEqual(requestPaths, [
    "/group/ranklist/13872/1",
    `/ko/u/${handle}`,
  ]);
  assert.deepEqual(await (await search()).json(), []);
  await runCycle();
  const members = await (await search()).json();
  assert.equal(members.length, 1);
  assert.equal(members[0].jungol_name, handle);
  assert.equal(members[0].solution, "100");
  assert.ok(requestPaths.includes(`/api/v4/users/${handle}`));
  const eventAcceptedTime = Math.floor(Date.now() / 1000);

  // The production history scheduler and the per-member job are both due after 30 seconds.
  await Bun.sleep(30_050);
  await runCycle();
  assert.ok(requestPaths.some((path) => path.startsWith("/api/v4/problems?")));
  const [baseline] = await database.rawPool.query(
    "SELECT problem FROM problem ORDER BY problem",
  );
  assert.deepEqual(baseline, [
    { problem: 1000 },
    { problem: 1500 },
    { problem: eventProblem },
  ]);
  console.log(
    "E2E: rank → Chromium profile → BOJ baseline and solved.ac history",
  );

  newTime = eventAcceptedTime;
  await runCycle();
  assert.ok(requestPaths.includes(`/status?user_id=${handle}&top=100`));
  assert.equal(
    requestPaths.filter((path) => path === `/api/v4/users/${handle}`).length,
    2,
  );
  assert.equal(
    requestPaths.filter((path) => path === `/api/v4/problems/${eventProblem}`)
      .length,
    1,
  );
  const [settled] = await database.rawPool.query(
    "SELECT CAST(external_submission_id AS CHAR) AS submission,problem,repeatation FROM problem WHERE problem=2000",
  );
  assert.deepEqual(settled, [
    { submission: "102", problem: eventProblem, repeatation: 0 },
  ]);
  await runCycle();
  const [finalMembers] = await database.rawPool.query(
    "SELECT handle FROM user ORDER BY id",
  );
  assert.deepEqual(finalMembers, [{ handle }]);
  const [scores] = await database.rawPool.query(
    "SELECT rule_type,bias FROM score_history ORDER BY rule_type",
  );
  assert.deepEqual(scores, [
    { rule_type: "daily", bias: 1 },
    { rule_type: "event", bias: 1 },
  ]);
  console.log(
    "E2E: one accepted submission, one daily point, one event point, zero duplicates",
  );

  app.listen(3000);
  const stop = async () => {
    try {
      await app.stop();
    } finally {
      await close();
    }
  };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());
} catch (error) {
  await close();
  throw error;
} finally {
  upstream.stop(true);
}
