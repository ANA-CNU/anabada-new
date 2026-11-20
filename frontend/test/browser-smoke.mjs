import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://bada-nginx";
const artifactDirectory = process.env.SMOKE_ARTIFACT_DIR ?? "/artifacts";
const consoleFailures = [];
const pageFailures = [];
const serverFailures = [];
const clientFailures = [];

await mkdir(artifactDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1024 },
  timezoneId: "Asia/Seoul",
});
const page = await context.newPage();
let mobileContext;

function observePage(target) {
  target.on("console", (message) => {
    if (message.type() === "error") consoleFailures.push(message.text());
  });
  target.on("pageerror", (error) => pageFailures.push(error.message));
  target.on("dialog", (dialog) => void dialog.accept());
  target.on("response", (response) => {
    const url = new URL(response.url());
    if (response.status() >= 500) {
      serverFailures.push(`${response.status()} ${url.pathname}`);
    }
    if (response.status() >= 400 && url.pathname.startsWith("/api/")) {
      clientFailures.push(`${response.status()} ${url.pathname}`);
    }
  });
}

observePage(page);

async function open(pathname, locatorText) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle", timeout: 10_000 });
      await page.getByText(locatorText, { exact: false }).first().waitFor({ timeout: 10_000 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw lastError;
}

async function capture(name) {
  await capturePage(page, name);
}

function waitForApi(target, pathname, method = "GET") {
  return target.waitForResponse((response) => {
    const url = new URL(response.url());
    return `${url.pathname}${url.search}` === pathname && response.request().method() === method;
  });
}

async function readApi(pendingResponse) {
  const response = await pendingResponse;
  assert.equal(response.status(), 200, response.url());
  return response.json();
}

async function checkAdminOverview(target, usersResponse, eventsResponse) {
  const [users, events] = await Promise.all([readApi(usersResponse), readApi(eventsResponse)]);
  assert.ok(users.data.length > 0);
  assert.ok(events.pagination.total > 0);
  await target.getByTestId("admin-user-count").and(target.getByText(users.data.length.toLocaleString("ko-KR"), { exact: true })).waitFor();
  await target.getByTestId("admin-active-event-count").and(target.getByText(events.pagination.total.toLocaleString("ko-KR"), { exact: true })).waitFor();
}

async function capturePage(target, name) {
  const body = await target.locator("body").innerText();
  if (/\bundefined\b/u.test(body)) throw new Error(`${name}: rendered undefined text`);
  await resetScrollPositions(target);
  await assertPageFitsViewport(target, name);
  await target.screenshot({ path: join(artifactDirectory, `${name}.png`), fullPage: true });
}

async function captureViewport(name, locator) {
  await captureViewportForPage(page, name, locator);
}

async function captureViewportForPage(target, name, locator) {
  const body = await target.locator("body").innerText();
  if (/\bundefined\b/u.test(body)) throw new Error(`${name}: rendered undefined text`);
  await resetScrollPositions(target);
  await locator.scrollIntoViewIfNeeded();
  await target.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await assertPageFitsViewport(target, name);
  await target.screenshot({ path: join(artifactDirectory, `${name}.png`) });
}

async function resetScrollPositions(target) {
  await target.evaluate(() => {
    window.scrollTo(0, 0);
    for (const element of document.querySelectorAll("*")) {
      if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
        element.scrollTo(0, 0);
      }
    }
  });
  await target.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function assertPageFitsViewport(target, name) {
  const dimensions = await target.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  if (dimensions.bodyWidth > dimensions.viewportWidth || dimensions.documentWidth > dimensions.viewportWidth) {
    throw new Error(`${name}: page-level horizontal overflow detected`);
  }
}

async function assertSearchMetricTokens(target) {
  for (const metric of ["정답: 3", "제출: 4", "솔루션: 1001"]) {
    const token = target.getByText(metric, { exact: true });
    await token.waitFor();
    const layout = await token.evaluate((element) => ({
      lineCount: element.getClientRects().length,
      whiteSpace: getComputedStyle(element).whiteSpace,
    }));
    if (layout.lineCount !== 1 || layout.whiteSpace !== "nowrap") {
      throw new Error(`search metric token is allowed to split: ${metric}`);
    }
  }
}

async function assertUserProfile(target) {
  await target.getByRole("heading", { name: "사용자 프로필", exact: true }).waitFor();
  for (const value of ["정답 수", "75%", "수동 차감", "이번 달 요약", "랭킹 변화 (7개 데이터)"]) {
    await target.getByText(value, { exact: true }).waitFor({ timeout: 5_000 });
  }
  const problem = target.getByRole("link", { name: "현재월", exact: true });
  await problem.waitFor({ timeout: 5_000 });
  if ((await problem.getAttribute("href")) !== "https://www.acmicpc.net/problem/1000") {
    throw new Error("profile problem did not link to Baekjoon");
  }
}

async function assertProfileErrors(target, screenshotPrefix) {
  // This page intentionally triggers API errors. Keep it out of the success-path error counters.
  const errorPage = await target.newPage();
  try {
    const missingUser = errorPage.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/users/2147483647",
      { timeout: 5_000 },
    );
    await errorPage.goto(`${baseUrl}/user/2147483647`);
    if ((await missingUser).status() !== 404) throw new Error("missing profile API did not return 404");
    await errorPage.getByRole("alert").filter({ hasText: "사용자를 찾을 수 없습니다." })
      .waitFor({ timeout: 5_000 });
    await capturePage(errorPage, `${screenshotPrefix}user-profile-not-found`);

    await errorPage.route("**/api/users/1", (route) => route.fulfill({ status: 503 }));
    await errorPage.goto(`${baseUrl}/user/1`);
    await errorPage.getByRole("alert").filter({ hasText: "사용자 정보를 불러오지 못했습니다." })
      .waitFor({ timeout: 5_000 });
    await capturePage(errorPage, `${screenshotPrefix}user-profile-unavailable`);
    await errorPage.getByRole("button", { name: "뒤로 가기", exact: true }).click();
    await errorPage.waitForURL(`${baseUrl}/`, { timeout: 5_000 });

    await errorPage.unroute("**/api/users/1");
    await errorPage.route("**/api/user/1/problems", (route) => route.fulfill({ status: 503 }));
    await errorPage.goto(`${baseUrl}/user/1`);
    await errorPage.getByRole("alert").filter({ hasText: "문제 풀이 기록을 불러오지 못했습니다." })
      .waitFor({ timeout: 5_000 });
    await errorPage.getByText("수동 차감", { exact: true }).waitFor({ timeout: 5_000 });
    if (await errorPage.getByText("해결한 문제가 없습니다.", { exact: true }).isVisible()) {
      throw new Error("profile shows an empty history when the problems request failed");
    }
    await capturePage(errorPage, `${screenshotPrefix}user-profile-activity-unavailable`);
  } finally {
    await errorPage.close();
  }
}

try {
  const health = await page.request.get("http://anabada-backend:3000/health");
  if (health.status() !== 200) throw new Error(`backend health returned ${health.status()}`);

  await open("/", "실시간 활동 현황");
  await page.getByText("최근 해결한 문제", { exact: true }).waitFor();
  await page.getByText("최근 점수 획득", { exact: true }).waitFor();
  await page.getByText("이번 달 문제 해결", { exact: true }).waitFor();
  await capture("home-ranking-activity");

  await captureViewport("monthly-statistics", page.getByText("월별 문제 해결 통계", { exact: true }));

  await page.getByText("현재 진행중인 이벤트", { exact: false }).scrollIntoViewIfNeeded();
  await capture("events");

  await page.getByPlaceholder("사용자 이름을 입력하세요...").fill("alpha");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await page.getByText("검색 결과", { exact: true }).waitFor();
  await assertSearchMetricTokens(page);
  await captureViewport("user-search", page.getByText("검색 결과", { exact: true }));

  const alphaResult = page.getByRole("button", { name: /alpha/u });
  await alphaResult.focus();
  await alphaResult.press("Enter");
  await assertUserProfile(page);
  await capture("user-profile");
  await assertProfileErrors(context, "");

  const unauthenticated = await page.request.get(`${baseUrl}/admin`, { headers: { Accept: "application/json" } });
  assert.equal(unauthenticated.status(), 401);
  await open("/admin", "로그인");
  await page.waitForURL(`${baseUrl}/login`);
  await page.locator("#username").fill("smoke-admin");
  await page.locator("#password").fill("smoke-password");
  const dashboardUsers = waitForApi(page, "/api/users/all");
  const dashboardEvents = waitForApi(page, "/api/events?status=active&limit=1");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL(`${baseUrl}/admin`, { timeout: 10_000 });
  await page.getByRole("heading", { name: "대시보드", exact: true }).waitFor();
  await checkAdminOverview(page, dashboardUsers, dashboardEvents);
  await capture("admin-dashboard");

  await page.getByRole("button", { name: "유저 목록", exact: true }).click();
  await page.getByText("유저 정보를 조회·수정·삭제합니다.", { exact: false }).waitFor();
  await page.getByPlaceholder("백준 아이디, 한국명 검색").fill("alpha");
  await page.getByRole("cell", { name: "alpha", exact: true }).waitFor();
  await capture("admin-users");

  await page.getByRole("button", { name: "점수 관리", exact: true }).click();
  await page.getByRole("heading", { name: "점수 관리", exact: true }).waitFor();
  await page.getByLabel("사용자 이름").fill("alpha");
  await page.getByText(/\(alpha\)$/u).click();
  await page.getByLabel("사용자 이름").press("Enter");
  await page.getByPlaceholder("가중치 입력").fill("4");
  const scoreReason = "관리자 브라우저 테스트 점수";
  await page.getByPlaceholder("가중치 적용 이유").fill(scoreReason);
  const scorePost = waitForApi(page, "/api/score-history/bulk", "POST");
  await page.getByRole("button", { name: "점수 관리 적용", exact: true }).click();
  assert.equal((await readApi(scorePost)).insertedCount, 1);
  await capture("admin-score");

  await page.getByRole("button", { name: "로그 관리", exact: true }).click();
  await page.getByRole("heading", { name: "로그 관리", exact: true }).waitFor();
  await page.getByPlaceholder("username").fill("alpha");
  const filteredLogs = waitForApi(page, "/api/admin/score-history?page=1&limit=10&username=alpha");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  const scoreLog = (await readApi(filteredLogs)).data.find((row) => row.desc === scoreReason);
  assert.ok(scoreLog);
  assert.equal(scoreLog.bias, 4);
  const scoreRow = page.getByRole("row", { name: new RegExp(scoreReason, "u") });
  await scoreRow.waitFor();
  await capture("admin-score-logs");

  await page.getByRole("button", { name: "가중치 관리", exact: true }).click();
  await page.getByRole("heading", { name: "가중치 관리", exact: true }).waitFor();
  const biasRows = await readApi(page.request.get(`${baseUrl}/api/bias/all`));
  const alphaBias = biasRows.data.find((row) => row.jungol_name === "alpha");
  assert.ok(alphaBias);
  await page.getByPlaceholder("사용자 검색").fill("alpha");
  await page.getByRole("row", { name: /\(alpha\)/u }).getByRole("cell", { name: String(alphaBias.total_point), exact: true }).waitFor();
  await capture("admin-bias");

  await page.getByRole("button", { name: "웹훅 관리", exact: true }).click();
  await page.getByRole("heading", { name: "Webhook 관리", exact: true }).waitFor();
  const ignoredHook = page.locator("tr", { hasText: "https://ignored.invalid/hook" });
  await ignoredHook.getByText("비활성화", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Webhook 추가", exact: true }).click();
  await page.locator("#url").fill("https://created.invalid/hook");
  const hookCreate = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/hooks" && response.request().method() === "POST";
  });
  await page.getByRole("button", { name: "추가", exact: true }).click();
  if ((await hookCreate).status() !== 200) throw new Error("webhook creation failed");
  await page.getByText("https://created.invalid/hook", { exact: true }).waitFor();
  await capture("admin-hooks");

  const boardsResponse = await page.request.get(`${baseUrl}/api/admin/ranking-boards?page=1&limit=10`);
  if (boardsResponse.status() !== 200) throw new Error("ranking board list failed");
  const boardsPayload = await boardsResponse.json();
  const originalActiveBoard = boardsPayload.data.find((board) => board.is_active);
  const targetBoard = boardsPayload.data.find((board) => !board.is_active && board.member_count > 0);
  if (!originalActiveBoard || !targetBoard) throw new Error("ranking board smoke fixture is incomplete");
  const targetDetailResponse = await page.request.get(`${baseUrl}/api/admin/ranking-boards/${targetBoard.id}`);
  if (targetDetailResponse.status() !== 200) throw new Error("ranking board detail failed");
  const targetDetail = await targetDetailResponse.json();

  await page.getByRole("button", { name: "추첨 보드 관리", exact: true }).click();
  await page.getByRole("heading", { name: "추첨 보드 관리", exact: true }).waitFor();
  const targetRow = page.locator("table").first().locator("tbody tr").filter({
    has: page.getByRole("cell", { name: String(targetBoard.id), exact: true }),
  });
  await targetRow.getByRole("button", { name: "상세 보기", exact: true }).click();
  await page.getByText(`보드 #${targetBoard.id}`, { exact: false }).waitFor();
  await page.getByText(targetDetail.data.members[0].jungol_name, { exact: true }).last().waitFor();
  const renderedMembers = await page.evaluate(() => {
    const memberTable = Array.from(document.querySelectorAll("table")).find((table) =>
      Array.from(table.querySelectorAll("th")).some((header) => header.textContent?.trim() === "사용자"),
    );
    if (!memberTable) return null;
    return Array.from(memberTable.querySelectorAll("tbody tr")).map((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      return { rank: cells[0]?.textContent?.trim(), jungolName: cells[1]?.textContent?.trim() };
    });
  });
  const expectedMembers = targetDetail.data.members.map((member) => ({ rank: String(member.rank), jungolName: member.jungol_name }));
  if (renderedMembers === null || JSON.stringify(renderedMembers) !== JSON.stringify(expectedMembers)) {
    throw new Error(`ranking board detail members are not rendered in rank order: ${JSON.stringify({ renderedMembers, expectedMembers })}`);
  }
  await page.getByRole("button", { name: "활성화", exact: true }).click();
  await page.getByRole("dialog").getByRole("heading", { name: "추첨 보드를 활성화할까요?", exact: true }).waitFor();
  const activation = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === `/api/admin/ranking-boards/${targetBoard.id}/active` && response.request().method() === "PATCH";
  });
  await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).click();
  if ((await activation).status() !== 200) throw new Error("ranking board activation failed");
  await page.getByText("활성", { exact: true }).last().waitFor();

  const publicAfterActivation = await page.request.get(`${baseUrl}/api/ranking/selected-month-board`);
  if (publicAfterActivation.status() !== 200) throw new Error("public selected board after activation failed");
  const publicEntries = (await publicAfterActivation.json()).data;
  const expectedEntries = targetDetail.data.members.slice(0, 7);
  if (publicEntries.length !== expectedEntries.length || publicEntries.some((entry, index) => entry.rank !== expectedEntries[index].rank || entry.jungol_name !== expectedEntries[index].jungol_name)) {
    throw new Error("public selected board does not match the activated board");
  }

  await page.getByRole("button", { name: "비활성화", exact: true }).click();
  await page.getByRole("dialog").getByText("더 이상 표시되지 않습니다", { exact: false }).waitFor();
  const deactivation = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === `/api/admin/ranking-boards/${targetBoard.id}/active` && response.request().method() === "PATCH";
  });
  await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).click();
  if ((await deactivation).status() !== 200) throw new Error("ranking board deactivation failed");
  const publicAfterDeactivation = await page.request.get(`${baseUrl}/api/ranking/selected-month-board`);
  if (publicAfterDeactivation.status() !== 200) throw new Error("public selected board after deactivation failed");
  if ((await publicAfterDeactivation.json()).data.length !== 0) throw new Error("deactivated board is still publicly selected");
  const restoreOriginal = await page.request.patch(`${baseUrl}/api/admin/ranking-boards/${originalActiveBoard.id}/active`, { data: { is_active: true } });
  if (restoreOriginal.status() !== 200) throw new Error("ranking board fixture restore failed");
  await capture("admin-ranking-boards");

  await page.getByRole("button", { name: "이벤트 목록", exact: true }).click();
  await page.getByRole("heading", { name: "이벤트 목록", exact: true }).waitFor();
  const eventBeforeResponse = await page.request.get(`${baseUrl}/api/events/201`);
  if (eventBeforeResponse.status() !== 200) throw new Error("event detail before update failed");
  const eventBefore = await eventBeforeResponse.json();
  const eventBeginBefore = eventBefore.data.begin;
  const eventEndBefore = eventBefore.data.end;
  const activeEvent = page.locator("[data-slot=card]", { hasText: "진행 이벤트" });
  await activeEvent.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("dialog").getByText("이벤트 수정", { exact: true }).waitFor();
  await page.locator("#problems").fill("1000");
  const eventUpdate = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/events/201" && response.request().method() === "PUT";
  });
  await page.getByRole("dialog").getByRole("button", { name: "수정", exact: true }).click();
  if ((await eventUpdate).status() !== 200) throw new Error("event update failed");
  await page.getByRole("heading", { name: "이벤트 목록", exact: true }).waitFor();
  const eventAfterResponse = await page.request.get(`${baseUrl}/api/events/201`);
  if (eventAfterResponse.status() !== 200) throw new Error("event detail after update failed");
  const eventAfter = await eventAfterResponse.json();
  if (eventAfter.data.begin !== eventBeginBefore || eventAfter.data.end !== eventEndBefore) {
    throw new Error("event update changed the stored begin or end instant");
  }
  await capture("admin-events");
  await page.getByRole("button", { name: "이벤트 추가", exact: true }).click();
  await page.getByRole("heading", { name: "이벤트 추가", exact: true }).waitFor();
  const eventTitle = "관리자 브라우저 테스트 이벤트";
  await page.getByLabel("이벤트 제목 *").fill(eventTitle);
  const calendarDay = await page.evaluate(() => new Date().toLocaleDateString());
  for (const field of ["start-date-picker", "end-date-picker"]) {
    const trigger = page.locator(`#${field}`);
    await trigger.click();
    const calendarId = await trigger.getAttribute("aria-controls");
    assert.ok(calendarId);
    const calendar = page.locator(`[id=${JSON.stringify(calendarId)}]`);
    await calendar.locator(`button[data-day=${JSON.stringify(calendarDay)}]`).click();
    await page.keyboard.press("Escape");
    await calendar.waitFor({ state: "hidden" });
  }
  await page.getByPlaceholder(/문제 ID를 쉼표/u).fill("1000,1001");
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await capture("admin-event-add");
  const eventPost = waitForApi(page, "/api/event/create", "POST");
  await page.getByRole("button", { name: "이벤트 추가하기", exact: true }).click();
  const createdEvent = await readApi(eventPost);
  assert.equal(createdEvent.problems_count, 2);
  await page.getByText("이벤트가 성공적으로 생성되었습니다!", { exact: true }).waitFor();
  const newEventDetail = await readApi(page.request.get(`${baseUrl}/api/events/${createdEvent.event_id}`));
  assert.equal(newEventDetail.data.title, eventTitle);
  assert.deepEqual(newEventDetail.data.problems, [1000, 1001]);

  for (const section of ["활동 로그", "시스템 로그", "접속 기록", "알림 관리"]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    await page.getByRole("heading", { name: section, exact: true }).waitFor();
    await page.getByText("해당 기능은 추후 구현 예정입니다.", { exact: true }).waitFor();
  }
  const logout = waitForApi(page, "/logout", "POST");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  assert.equal((await logout).status(), 200);
  await page.goto(`${baseUrl}/admin`);
  await page.waitForURL(`${baseUrl}/login`);

  mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    timezoneId: "Asia/Seoul",
  });
  const mobilePage = await mobileContext.newPage();
  observePage(mobilePage);

  const openMobile = async (pathname, locatorText) => {
    await mobilePage.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle", timeout: 10_000 });
    await mobilePage.getByText(locatorText, { exact: false }).first().waitFor({ timeout: 10_000 });
  };
  const selectMobileAdminSection = async (menuLabel, heading) => {
    await mobilePage.getByRole("button", { name: "관리자 메뉴 열기", exact: true }).click();
    await mobilePage.getByRole("button", { name: menuLabel, exact: true }).click();
    await mobilePage.getByRole("heading", { name: heading, exact: true }).waitFor();
    await mobilePage.waitForTimeout(350);
  };

  await openMobile("/", "실시간 활동 현황");
  await capturePage(mobilePage, "mobile-home-ranking-activity");
  await captureViewportForPage(
    mobilePage,
    "mobile-monthly-statistics",
    mobilePage.getByText("월별 문제 해결 통계", { exact: true }),
  );
  await captureViewportForPage(
    mobilePage,
    "mobile-events",
    mobilePage.getByText("현재 진행중인 이벤트", { exact: false }),
  );

  await mobilePage.getByPlaceholder("사용자 이름을 입력하세요...").fill("alpha");
  await mobilePage.getByRole("button", { name: "검색", exact: true }).click();
  await mobilePage.getByText("검색 결과", { exact: true }).waitFor();
  await assertSearchMetricTokens(mobilePage);
  await captureViewportForPage(mobilePage, "mobile-user-search", mobilePage.getByText("검색 결과", { exact: true }));
  const mobileSearchButton = mobilePage.getByRole("button", { name: "검색", exact: true });
  const mobileAlphaResult = mobilePage.getByRole("button", { name: /alpha/u });
  await mobileSearchButton.focus();
  await mobilePage.keyboard.press("Tab");
  if (!(await mobileAlphaResult.evaluate((element) => element === document.activeElement))) {
    throw new Error("mobile user result did not receive keyboard focus");
  }
  await mobilePage.keyboard.press("Enter");
  await assertUserProfile(mobilePage);
  await capturePage(mobilePage, "mobile-user-profile");
  await assertProfileErrors(mobileContext, "mobile-");

  await openMobile("/login", "로그인");
  await mobilePage.locator("#username").fill("smoke-admin");
  await mobilePage.locator("#password").fill("smoke-password");
  const mobileUsers = waitForApi(mobilePage, "/api/users/all");
  const mobileEvents = waitForApi(mobilePage, "/api/events?status=active&limit=1");
  await mobilePage.getByRole("button", { name: "로그인", exact: true }).click();
  await mobilePage.waitForURL(`${baseUrl}/admin`, { timeout: 10_000 });
  await mobilePage.getByRole("heading", { name: "대시보드", exact: true }).waitFor();
  await checkAdminOverview(mobilePage, mobileUsers, mobileEvents);
  await capturePage(mobilePage, "mobile-admin-dashboard");

  await selectMobileAdminSection("유저 목록", "유저 목록");
  await capturePage(mobilePage, "mobile-admin-users");
  await selectMobileAdminSection("점수 관리", "점수 관리");
  await capturePage(mobilePage, "mobile-admin-score");
  await selectMobileAdminSection("웹훅 관리", "Webhook 관리");
  await mobilePage.getByText("비활성화", { exact: true }).waitFor();
  await capturePage(mobilePage, "mobile-admin-hooks");
  await selectMobileAdminSection("이벤트 목록", "이벤트 목록");
  await capturePage(mobilePage, "mobile-admin-events");
  await selectMobileAdminSection("로그 관리", "로그 관리");
  await mobilePage.getByText(scoreReason, { exact: true }).waitFor();
  await capturePage(mobilePage, "mobile-admin-score-logs");
  await selectMobileAdminSection("가중치 관리", "가중치 관리");
  await mobilePage.getByRole("row", { name: /\(alpha\)/u }).waitFor();
  await capturePage(mobilePage, "mobile-admin-bias");
  await selectMobileAdminSection("이벤트 추가", "이벤트 추가");
  await capturePage(mobilePage, "mobile-admin-event-add");

  if (consoleFailures.length > 0) throw new Error(`browser console errors: ${consoleFailures.join(" | ")}`);
  if (pageFailures.length > 0) throw new Error(`uncaught page errors: ${pageFailures.join(" | ")}`);
  if (serverFailures.length > 0) throw new Error(`unexpected 5xx responses: ${serverFailures.join(" | ")}`);
  if (clientFailures.length > 0) throw new Error(`unexpected API 4xx responses: ${clientFailures.join(" | ")}`);
} finally {
  await mobileContext?.close();
  await context.close();
  await browser.close();
}
