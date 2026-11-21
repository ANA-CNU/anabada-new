import assert from "node:assert/strict";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost";
const screenshots = process.env.SMOKE_ARTIFACT_DIR ?? "/artifacts";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, timezoneId: "Asia/Seoul" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === baseUrl && url.pathname.startsWith("/api/") && !response.ok())
      errors.push(`${response.status()} ${url.pathname}`);
  });
  const get = async (path) => {
    const response = await page.request.get(`${baseUrl}${path}`);
    assert.ok(response.ok(), `${path}: HTTP ${response.status()}`);
    return response.json();
  };
  const users = await get("/api/user/search?q=e2e_member");
  assert.equal(users.length, 1);
  const [user] = users;
  assert.equal(user.jungol_name, "e2e_member");
  assert.equal(user.corrects, 3);
  assert.equal(user.submissions, 4);
  assert.equal(user.solution, "103");
  const [problems, scores, summary, ranks] = await Promise.all([
    get(`/api/user/${user.id}/problems`),
    get(`/api/score_history/user/${user.id}`),
    get(`/api/user/${user.id}/monthly-summary`),
    get(`/api/board/user/${user.id}/rank-history`),
  ]);
  assert.deepEqual(problems.map(({ problem }) => problem).sort((a, b) => a - b), [1000, 1500, 2000]);
  assert.deepEqual(scores.map(({ bias }) => bias), [1, 1]);
  assert.equal(summary.data.total_solved, 1);
  assert.equal(summary.data.total_score, 2);
  assert.deepEqual(ranks.map(({ rank }) => rank), [1]);

  await page.goto(`${baseUrl}/user/${user.id}`);
  await page.getByRole("heading", { name: "사용자 프로필", exact: true }).waitFor();
  await page.getByText("75%", { exact: true }).waitFor();
  await page.getByText("이번 달 요약", { exact: true }).waitFor();
  await page.getByText("랭킹 변화 (1개 데이터)", { exact: true }).waitFor();
  for (const [label, number] of [["초기 백준 풀이", 1000], ["solved.ac 과거 풀이", 1500], ["E2E 신규 정답", 2000]]) {
    const link = page.getByRole("link", { name: label, exact: true });
    await link.waitFor();
    assert.equal(await link.getAttribute("href"), `https://www.acmicpc.net/problem/${number}`);
  }
  await page.getByText(/일일 점수 획득/u).waitFor();
  await page.getByText(/문제를 풀어 점수 획득/u).waitFor();
  assert.deepEqual(errors, []);
  await page.screenshot({ path: join(screenshots, "one-member-profile.png"), fullPage: true });
  console.log("E2E: member search API verified; profile rendered 3 problem links, 2 points, and rank #1");
} finally {
  await browser.close();
}
