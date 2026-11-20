import { expect, test } from "bun:test";
import { parseBojRank, parseBojStatus } from "../src/boj/html-source.js";
import { bojSubmissionId, syncBojMember } from "../src/boj/member-sync.js";
import { BojPageReader, BojReadError } from "../src/boj/page-reader.js";

const signal = new AbortController().signal;
const html = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/html" } });

function rank(handle: string, next?: number): string {
  return `<table id="ranklist"><thead><tr><th>등수</th><th>아이디</th><th>상태 메시지</th><th>맞은 문제</th><th>제출</th></tr></thead>
    <tbody><tr><td>1</td><td><a href="/user/${handle}">${handle}<span></span></a></td>
    <td></td><td><a href="/status?user_id=${handle}&amp;result_id=4">1,234</a></td>
    <td><a href="/status?user_id=${handle}">2,345</a></td></tr></tbody></table>
    ${next ? `<a href="/group/ranklist/13872/${next}">${next}</a>` : ""}`;
}

function status(
  handle: string,
  rows: readonly string[],
  next?: string,
): string {
  return `<table id="status-table"><thead><tr><th>제출 번호</th><th>아이디</th><th>문제</th><th>결과</th><th>채점 서버</th><th>제출한 시간</th></tr></thead>
    <tbody>${rows.join("")}</tbody></table>
    ${next ? `<a href="/status?user_id=${handle}&amp;top=${next}">다음 페이지</a>` : ""}`;
}

function submission(id: string, result = "result-ac", handle = "alpha") {
  return `<tr id="solution-${id}"><td>${id}</td><td><a href="/user/${handle}">${handle}</a></td>
    <td><a href="/problem/1000">1000</a></td><td><span class="${result}">채점 결과</span></td>
    <td>BOJ</td><td><a data-timestamp="1777205471" title="표시 시각">제출 시각</a></td></tr>`;
}

test("reads counts and handles by column name rather than the rank row text", async () => {
  await expect(parseBojRank(rank("alpha", 2), 13872)).resolves.toEqual({
    members: [{ handle: "alpha", solvedCount: 1234, submissionCount: 2345 }],
    pages: [2],
  });
});

test("preserves BOJ's inclusive top, UTC seconds, and three verdict states", async () => {
  const page = await parseBojStatus(
    status(
      "alpha",
      [
        submission("110"),
        submission("109", "result-pac"),
        submission("108", "result-wait"),
      ],
      "107",
    ),
    "alpha",
  );

  expect(page.nextTop).toBe(bojSubmissionId.parse("107"));
  expect(page.submissions).toEqual([
    {
      id: bojSubmissionId.parse("110"),
      verdict: "accepted",
      problemNumber: 1000,
      submittedAt: new Date(1777205471000),
    },
    { id: bojSubmissionId.parse("109"), verdict: "terminal" },
    { id: bojSubmissionId.parse("108"), verdict: "pending" },
  ]);
});

test("follows only the older top when an interior page also links to a previous page", async () => {
  const html = status("alpha", [submission("108"), submission("107")], "105");
  const previous =
    '<a href="/status?user_id=alpha&amp;top=120">이전 페이지</a>';

  await expect(parseBojStatus(html + previous, "alpha")).resolves.toMatchObject(
    {
      nextTop: bojSubmissionId.parse("105"),
    },
  );
});

test("ends pagination when the last page has a previous link only", async () => {
  const html = status("alpha", [submission("98")]);
  const previous =
    '<a href="/status?user_id=alpha&amp;top=120">이전 페이지</a>';

  await expect(parseBojStatus(html + previous, "alpha")).resolves.toMatchObject(
    {
      nextTop: null,
    },
  );
});

test("errors on a login page and on a status page belonging to another user", async () => {
  await expect(
    parseBojStatus("<html><h1>로그인</h1></html>", "alpha"),
  ).rejects.toMatchObject({
    reason: "missing_table",
  });
  await expect(
    parseBojStatus(
      status("alpha", [submission("110", "result-ac", "beta")]),
      "alpha",
    ),
  ).rejects.toMatchObject({
    reason: "invalid_status_row",
  });
});

test("rejects an accepted submission whose displayed ID or timestamp is invalid", async () => {
  const accepted = submission("110");
  for (const row of [
    accepted.replace("<td>110</td>", "<td>109</td>"),
    accepted.replace('data-timestamp="1777205471"', 'data-timestamp=""'),
  ]) {
    await expect(
      parseBojStatus(status("alpha", [row]), "alpha"),
    ).rejects.toMatchObject({
      reason: "invalid_status_row",
    });
  }
});

test("rejects an older-page link targeting a different handle or multiple cursors", async () => {
  const page = status("alpha", [submission("110")], "107");
  for (const malformed of [
    page.replaceAll("user_id=alpha", "user_id=beta"),
    `${page}<a href="/status?user_id=alpha&amp;top=106">다음 페이지</a>`,
  ]) {
    await expect(parseBojStatus(malformed, "alpha")).rejects.toMatchObject({
      reason: "invalid_status_link",
    });
  }
});

test("serializes concurrent ranking and status reads with a five-second gap after each response", async () => {
  const calls: Array<{ path: string; time: number }> = [];
  let time = 0;
  const reader = new BojPageReader({
    monotonicNow: () => time,
    wait: async (ms) => {
      time += ms;
    },
    request: async (url) => {
      calls.push({ path: url.pathname, time });
      time += 500;
      if (url.pathname.endsWith("/1")) return html(rank("alpha", 2));
      if (url.pathname.endsWith("/2")) return html(rank("beta"));
      return html(status("alpha", [submission("110")]));
    },
  });

  const [members] = await Promise.all([
    reader.readGroupMembers(13872, signal),
    reader.readSubmissionPage({ handle: "alpha", top: null, signal }),
  ]);

  expect(members.map(({ handle }) => handle)).toEqual(["alpha", "beta"]);
  expect(calls).toEqual([
    { path: "/group/ranklist/13872/1", time: 0 },
    { path: "/status", time: 5_500 },
    { path: "/group/ranklist/13872/2", time: 11_000 },
  ]);
});

test("discovers additional rank pages and rejects a partial roster with a duplicate handle", async () => {
  const pages: string[] = [];
  const fixtures = [rank("alpha", 2), rank("beta", 3), rank("ALPHA")];
  let time = 0;
  const reader = new BojPageReader({
    monotonicNow: () => time,
    wait: async (ms) => {
      time += ms;
    },
    request: async (url) => {
      pages.push(url.pathname);
      const page = fixtures[pages.length - 1];
      if (!page) throw new Error("Unexpected rank page");
      return html(page);
    },
  });

  await expect(reader.readGroupMembers(13872, signal)).rejects.toMatchObject({
    reason: "invalid_roster",
  });
  expect(pages).toEqual(
    [1, 2, 3].map((page) => `/group/ranklist/13872/${page}`),
  );
});

test("honors Retry-After across the ranking and status endpoints", async () => {
  const started: number[] = [];
  let time = 0;
  const reader = new BojPageReader({
    monotonicNow: () => time,
    wait: async (ms) => {
      time += ms;
    },
    request: async (url) => {
      started.push(time);
      return url.pathname === "/status"
        ? new Response(null, { status: 429, headers: { "Retry-After": "13" } })
        : html(rank("alpha"));
    },
  });

  await expect(
    reader.readSubmissionPage({ handle: "alpha", top: null, signal }),
  ).rejects.toBeInstanceOf(BojReadError);
  await reader.readGroupMembers(13872, signal);

  expect(started).toEqual([0, 13_000]);
});

test("reads HTML through the service and hands only newer accepted submissions to settlement", async () => {
  const cursors: Array<string | null> = [];
  let time = 0;
  const reader = new BojPageReader({
    monotonicNow: () => time,
    wait: async (ms) => {
      time += ms;
    },
    request: async (url) => {
      if (url.pathname !== "/status") return html(rank("alpha"));
      const top = url.searchParams.get("top");
      cursors.push(top);
      return top === null
        ? html(
            status(
              "alpha",
              [submission("120"), submission("115", "result-wa")],
              "108",
            ),
          )
        : html(status("alpha", [submission("108"), submission("98")]));
    },
  });
  const [member] = await reader.readGroupMembers(13872, signal);
  const acceptedIds: string[] = [];

  const outcome = await syncBojMember(
    {
      member,
      checkpoint: {
        committedThrough: bojSubmissionId.parse("100"),
        solvedCount: 1200,
        submissionCount: 2000,
        retryRequired: false,
      },
      reconcile: false,
      signal,
    },
    {
      readPage: (request) => reader.readSubmissionPage(request),
      commit: async ({ accepted }) => {
        acceptedIds.push(...accepted.map(({ id }) => id));
      },
    },
  );

  expect(outcome).toBe("settled");
  expect(cursors).toEqual([null, "108"]);
  expect(acceptedIds).toEqual(["108", "120"]);
});
