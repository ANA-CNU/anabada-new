import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { join } from "node:path";
import { chromium } from "playwright";
import { measureIconAlignment, measureIconPair } from "./icon-alignment.mjs";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost";
const artifactDirectory = process.env.SMOKE_ARTIFACT_DIR ?? "/artifacts";
const sessionSecret = process.env.SMOKE_SESSION_SECRET;
assert.ok(sessionSecret?.length >= 32, "SMOKE_SESSION_SECRET must contain the fixture session key");
const iconAlignment = [];
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
page.setDefaultTimeout(10_000);
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
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
  await assertPageFitsDesktopCanvas(target, name);
  iconAlignment.push(...await measureIconAlignment(target, name));
  await target.screenshot({ path: join(artifactDirectory, `${name}.png`), fullPage: true, animations: "disabled" });
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
  await assertPageFitsDesktopCanvas(target, name);
  iconAlignment.push(...await measureIconAlignment(target, name));
  await target.screenshot({ path: join(artifactDirectory, `${name}.png`), animations: "disabled" });
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

async function assertPageFitsDesktopCanvas(target, name) {
  const dimensions = await target.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.getElementById("site-content")?.scrollWidth,
  }));
  const canvasWidth = Math.max(1440, dimensions.viewportWidth);
  if (dimensions.contentWidth !== undefined) {
    assert.ok(dimensions.documentWidth <= dimensions.viewportWidth, name + ": public chrome overflowed the window");
    assert.ok(dimensions.contentWidth <= canvasWidth, name + ": content overflowed the fixed desktop canvas");
  } else {
    assert.ok(dimensions.bodyWidth <= 1440 && dimensions.documentWidth <= canvasWidth, name + ": content overflowed the fixed desktop canvas");
  }
}

async function checkPublicChrome(target) {
  for (const width of [320, 390, 768, 1000, 1440, 1920]) {
    await target.setViewportSize({ width, height: 900 });
    const geometry = await target.evaluate(() => {
      const content = document.getElementById("site-content");
      const frame = content.firstElementChild.getBoundingClientRect();
      const header = document.querySelector(".site-header");
      const footer = document.querySelector(".site-footer");
      const nav = header.querySelector(".site-nav").getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      const inView = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.left >= -0.5 && rect.right <= viewport + 0.5;
      };
      const controls = [
        ...header.querySelectorAll("a, button"),
        ...footer.querySelectorAll("a, button, .site-footer-columns h2"),
      ];
      const leftBefore = [header.getBoundingClientRect().left, footer.getBoundingClientRect().left];
      content.scrollLeft = 240;
      const leftAfter = [header.getBoundingClientRect().left, footer.getBoundingClientRect().left];
      const contentScroll = content.scrollLeft;
      content.scrollLeft = 0;
      return {
        frameX: frame.left, frameWidth: frame.width, viewport,
        headerWidth: header.clientWidth, footerWidth: footer.clientWidth,
        headerOverflow: header.scrollWidth, footerOverflow: footer.scrollWidth,
        rightInView: controls.every(inView),
        navCenter: nav.left + nav.width / 2,
        documentWidth: document.documentElement.scrollWidth,
        windowScroll: window.scrollX, contentScroll, leftBefore, leftAfter,
      };
    });

    assert.equal(geometry.frameWidth, 1440);
    assert.ok(Math.abs(geometry.frameX - Math.max(0, (geometry.viewport - 1440) / 2)) < 1);
    assert.equal(geometry.headerWidth, geometry.viewport);
    assert.equal(geometry.footerWidth, geometry.viewport);
    assert.equal(geometry.headerOverflow, geometry.viewport);
    assert.equal(geometry.footerOverflow, geometry.viewport);
    assert.equal(geometry.documentWidth, geometry.viewport);
    assert.equal(geometry.rightInView, true);
    assert.ok(Math.abs(geometry.navCenter - geometry.viewport / 2) < 1);
    assert.equal(geometry.windowScroll, 0);
    assert.equal(geometry.contentScroll, Math.min(240, Math.max(0, 1440 - geometry.viewport)));
    assert.deepEqual(geometry.leftBefore, [0, 0]);
    assert.deepEqual(geometry.leftAfter, geometry.leftBefore);

    if (width === 320 || width === 390 || width === 768) {
      await target.getByRole("banner").screenshot({ path: join(artifactDirectory, "public-header-" + width + ".png") });
      await target.getByRole("contentinfo").screenshot({ path: join(artifactDirectory, "public-footer-" + width + ".png") });
    }
  }

  await target.setViewportSize({ width: 390, height: 844 });
  await target.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "대회", exact: true }).click();
  const panel = target.locator(".site-menu-panel");
  const panelBox = await panel.boundingBox();
  assert.ok(panelBox && panelBox.x >= 0 && panelBox.x + panelBox.width <= 390);
  await target.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden" });
  const previousUrl = target.url();
  await target.getByRole("contentinfo").getByRole("link", { name: "이용약관", exact: true }).click();
  await target.waitForURL(`${baseUrl}/terms`);
  await target.getByRole("heading", { name: "이용약관", level: 1, exact: true }).waitFor();
  await target.goBack();
  await target.waitForURL(previousUrl);
}

async function assertUserProfile(target) {
  await target.getByRole("heading", { name: "사용자 프로필", exact: true }).waitFor();
  const accuracy = target.locator('[data-slot="card"]').filter({ has: target.getByText("정답률", { exact: true }) });
  await accuracy.getByText("75%", { exact: true }).waitFor({ timeout: 5_000 });
  for (const value of ["정답 수", "수동 차감", "이번 달 요약", "랭킹 변화 (7개 데이터)"]) {
    await target.getByText(value, { exact: true }).waitFor({ timeout: 5_000 });
  }
  const problem = target.getByRole("link", { name: "현재월", exact: true });
  await problem.waitFor({ timeout: 5_000 });
  if ((await problem.getAttribute("href")) !== "https://www.acmicpc.net/problem/1000") {
    throw new Error("profile problem did not link to Baekjoon");
  }
}

async function assertProfileErrors(target, screenshotPrefix) {
  const errorPage = await target.newPage();
  try {
    const missingUser = await errorPage.goto(`${baseUrl}/user/2147483647`);
    assert.equal(missingUser.status(), 404);
    await errorPage.getByRole("alert").filter({ hasText: "사용자를 찾을 수 없습니다." }).waitFor();
    await capturePage(errorPage, `${screenshotPrefix}user-profile-not-found`);
    await errorPage.getByRole("link", { name: "홈으로", exact: true }).click();
    await errorPage.waitForURL(`${baseUrl}/`);
  } finally {
    await errorPage.close();
  }
}

async function authenticate(target, memberId = 1) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const claims = { iss: "anabada", aud: "anabada-web", sub: String(memberId), solvedAcId: String(7000 + memberId), iat: now, exp: now + 1800 };
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
  const signature = createHmac("sha256", sessionSecret).update(body).digest("base64url");
  await target.addCookies([{ name: "anabada_session", value: `${body}.${signature}`, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
}

async function checkSSR() {
  const noScripts = await browser.newContext({ javaScriptEnabled: false });
  try {
    const serverPage = await noScripts.newPage();
    await serverPage.goto(`${baseUrl}/`);
    await serverPage.getByRole("heading", { name: "ANABADA.", exact: true }).waitFor();
    const logo = serverPage.getByRole("link", { name: "bada 홈", exact: true }).locator("img");
    assert.match(await logo.getAttribute("src"), /^data:image\/webp;base64,/u);
    await logo.evaluate(async (image) => {
      await image.decode();
      if (image.naturalWidth === 0) throw new Error("The logo must be decoded from the initial HTML");
    });
    const cover = serverPage.locator('[data-squircle-radius="hero"]').first();
    await cover.waitFor();
    const fallbackShape = await cover.evaluate((element) => {
      document.documentElement.setAttribute("data-squircle-fallback", "");
      return getComputedStyle(element).clipPath;
    });
    assert.match(fallbackShape, /^polygon\(/u);
    await serverPage.evaluate(() => document.documentElement.removeAttribute("data-squircle-fallback"));
    const draw = await readApi(serverPage.request.get(`${baseUrl}/api/ranking/selected-month-board`));
    assert.ok(draw.data.length > 0);
    const drawRegion = serverPage.getByRole("region", { name: "지난 달 최종 추첨 결과" });
    await drawRegion.getByText(draw.data[0].display_name, { exact: true }).waitFor();
    const ranking = serverPage.getByRole("region", { name: "월간 랭킹" });
    await ranking.getByRole("button", { name: /^마지막 업데이트: (방금 전|\d+(분|시간|일) 전)$/u }).waitFor();
    await ranking.getByText(/^월간 풀이:/u).first().waitFor();
    assert.equal(await ranking.locator("[data-ranking-card]").first().evaluate((card) => getComputedStyle(card).opacity), "1");
    const rankingPosition = await ranking.boundingBox();
    assert.ok(rankingPosition);
    const headings = [
      "지난 달 최종 추첨 결과", "대회", "실시간 활동 현황", "전체 문제 수", "이전 이벤트", "최신 글",
    ];
    let previousY = rankingPosition.y;
    for (const name of headings) {
      const heading = serverPage.getByRole("heading", { name, exact: true });
      const position = await heading.boundingBox();
      assert.ok(position && position.y > previousY, `Unexpected position for ${name}`);
      previousY = position.y;
    }
    assert.equal(await serverPage.getByPlaceholder("사용자 이름을 입력하세요...").count(), 0);
    const contests = serverPage.getByRole("region", { name: "대회", exact: true });
    const series = [["생각하는 프로그래밍 대회", 5], ["SW-IT Contest", 5], ["ANAGETDON", 4]];
    assert.deepEqual(await contests.getByRole("heading", { level: 3 }).allTextContents(), series.map(([name]) => name));

    const cardPositions = [];
    for (const [name, editions] of series) {
      const region = contests.getByRole("region", { name, exact: true });
      assert.equal(await region.getByRole("listitem").count(), editions);
      const title = await region.getByRole("heading", { name, exact: true }).boundingBox();
      const description = await region.locator("header p").boundingBox();
      const firstEdition = await region.getByRole("listitem").first().boundingBox();
      assert.ok(title && description && firstEdition);
      cardPositions.push([title.y, description.y, firstEdition.y]);
    }
    for (const position of cardPositions.slice(1)) {
      assert.ok(position.every((y, index) => Math.abs(y - cardPositions[0][index]) < 0.5),
        "Contest titles, descriptions, and first edition rows should align");
    }
    const thinking = contests.getByRole("link", { name: "제5회 생각하는 프로그래밍 대회 문제 (백준)" });
    assert.equal(await thinking.getAttribute("href"), "https://acmicpc.net/category/detail/2793");
    const switProblems = [
      [2026, "AOJ", "https://aoj.anacnu.kr/sources/408"],
      [2025, "백준", "https://acmicpc.net/category/detail/4575"],
      [2024, "백준", "https://acmicpc.net/category/detail/4301"],
      [2023, "백준", "https://acmicpc.net/category/943"],
      [2022, "백준", "https://acmicpc.net/category/942"],
    ];
    for (const [year, judge, href] of switProblems) {
      const problems = contests.getByRole("link", { name: `${year} SW-IT Contest 문제 (${judge})` });
      assert.equal(await problems.getAttribute("href"), href);
    }
    for (const year of [2026, 2025, 2024, 2023]) {
      const editorial = contests.getByRole("link", { name: `${year} SW-IT Contest 공식 해설 PDF (새 탭)` });
      const pdf = await serverPage.request.get(`${baseUrl}${await editorial.getAttribute("href")}`);
      assert.equal(pdf.status(), 200);
      assert.match(pdf.headers()["content-type"], /application\/pdf/u);
    }
    for (const year of [2026, 2025]) {
      assert.equal((await serverPage.request.get(`${baseUrl}/contest/${year}`)).status(), 200);
    }
    await contests.getByRole("link", { name: "대회 모두 보기" }).click();
    await serverPage.getByRole("heading", { name: "대회 아카이브", exact: true }).waitFor();
    await serverPage.getByRole("link", { name: "2026 ANAGETDON Div. 1 (AOJ)" }).waitFor();
    const legacyDashboard = await serverPage.request.get(`${baseUrl}/dashboard`, { maxRedirects: 0 });
    assert.equal(legacyDashboard.status(), 308);
    assert.equal(new URL(legacyDashboard.headers().location, baseUrl).pathname, "/");
    await serverPage.goto(`${baseUrl}/enter`);
    await serverPage.getByRole("heading", { name: "참여 안내", exact: true }).waitFor();
    assert.equal(await serverPage.locator('a[href="/dashboard"]').count(), 0);
    await serverPage.goto(`${baseUrl}/`);
    await serverPage.getByText("최근 해결한 문제", { exact: true }).waitFor();
    assert.match(await serverPage.content(), /alpha/u);
    await serverPage.goto(`${baseUrl}/user/1`);
    await serverPage.getByRole("heading", { name: "사용자 프로필" }).waitFor();
    await serverPage.getByRole("link", { name: "현재월", exact: true }).waitFor();
  } finally {
    await noScripts.close();
  }
}

async function checkFooter() {
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("heading", { name: "주요 기능", exact: true }).waitFor();
  await footer.getByRole("heading", { name: "제작자", exact: true }).waitFor();
  const contributors = footer.getByRole("list", { name: "제작자 목록", exact: true });
  const contributorItems = contributors.getByRole("listitem");
  assert.equal(await contributorItems.count(), 4);
  for (const item of await contributorItems.all()) {
    assert.equal(await item.locator("svg.lucide-github").count(), 1);
  }
  assert.equal(await footer.getByRole("link", { name: "ANA 동아리", exact: true }).getAttribute("href"), "https://anacnu.kr");
  assert.equal(await footer.getByRole("link", { name: "참여 안내", exact: true }).getAttribute("href"), "/enter");
  assert.equal(await footer.getByRole("link", { name: "문의하기", exact: true }).getAttribute("href"), "https://github.com/ANA-CNU/anabada-new/issues");

  const previousUrl = page.url();
  const policies = [
    { name: "개인정보처리방침", route: "/privacy", sections: 8 },
    { name: "이용약관", route: "/terms", sections: 9 },
  ];
  for (const { name, route, sections } of policies) {
    const link = footer.getByRole("link", { name, exact: true });
    assert.equal(await link.getAttribute("href"), route);
    await link.press("Enter");
    await page.waitForURL(baseUrl + route);
    await page.getByRole("heading", { name, level: 1, exact: true }).waitFor();
    const document = page.getByRole("article");
    assert.equal(await document.getByRole("heading", { level: 2 }).count(), sections);
    assert.equal(await document.locator("time").getAttribute("datetime"), "2025-09-01");
    await capture(route.slice(1) + "-page");
    await page.goBack();
    await page.waitForURL(previousUrl);
  }
  await footer.screenshot({ path: join(artifactDirectory, "footer.png") });
}

async function checkBoardGrid() {
  for (const title of ["최단 경로 질문", "동적 계획법 풀이"]) {
    await page.goto(`${baseUrl}/board/new`);
    await page.locator("#post-title").fill(title);
    const editor = page.locator("#post-body");
    const bold = page.getByRole("button", { name: "굵게", exact: true });
    await editor.click();
    await bold.click();
    await page.locator('button[aria-label="굵게"][aria-pressed="true"]').waitFor();
    await page.keyboard.type("BFS");
    await editor.locator("strong").filter({ hasText: "BFS" }).waitFor();
    await page.getByRole("button", { name: "글 올리기" }).click();
    await page.waitForURL(/\/board\/[a-f0-9-]{36}$/u);
  }

  await page.goto(`${baseUrl}/board`);
  const covers = page.getByRole("main").locator("ol [data-tone]");
  await covers.nth(2).waitFor();
  const bounds = await Promise.all((await covers.all()).map((cover) => cover.boundingBox()));
  assert.equal(bounds.length, 3);
  for (const cover of bounds) {
    assert.ok(cover && Math.abs(cover.width - cover.height) < 1, "Board covers must be square");
    assert.equal(cover.y, bounds[0].y, "Desktop board must place three cards on the same row");
  }
  assert.ok(bounds[0].x < bounds[1].x && bounds[1].x < bounds[2].x);
  await capture("board-desktop");

  const narrowBoard = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await narrowBoard.goto(baseUrl + "/board");
    const covers = narrowBoard.getByRole("main").locator("ol [data-tone]");
    await covers.nth(2).waitFor();
    const narrow = await Promise.all((await covers.all()).map((cover) => cover.boundingBox()));
    assert.deepEqual(narrow, bounds, "Narrow windows must keep the same three-column board");
    const scrollWidth = await narrowBoard.locator("#site-content").evaluate((content) => content.scrollWidth);
    assert.equal(scrollWidth, 1440, "Narrow windows must provide horizontal scrolling inside the content");
    await assertPageFitsDesktopCanvas(narrowBoard, "board-narrow");
    await captureViewportForPage(narrowBoard, "board-narrow", covers.first());
  } finally {
    await narrowBoard.close();
  }
}

async function checkAccountMenu() {
  await page.goto(`${baseUrl}/settings`);
  await page.waitForURL(`${baseUrl}/login`);
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await authenticate(memberContext, 2);
    const member = await memberContext.newPage();
    await member.goto(`${baseUrl}/board`);
    await member.getByRole("button", { name: "beta", exact: true }).click();
    const accountPanel = await member.locator(".site-menu-panel").boundingBox();
    assert.ok(accountPanel && accountPanel.x >= 0 && accountPanel.x + accountPanel.width <= 390);
    assert.equal(await member.getByRole("link", { name: "관리자 대시보드" }).count(), 0);
    await assertPageFitsDesktopCanvas(member, "member-appbar-narrow");
    iconAlignment.push(...await measureIconAlignment(member, "member-appbar-narrow"));
    await member.screenshot({ path: join(artifactDirectory, "member-appbar-narrow.png") });
    await member.getByRole("link", { name: "설정", exact: true }).click();
    await member.getByRole("heading", { name: "설정", exact: true }).waitFor();
    await member.getByLabel("이름", { exact: true }).fill("베타 회원");
    await member.getByLabel("AtCoder 핸들").fill("beta_atcoder");
    await member.getByLabel("Codeforces 핸들").fill("beta-cf");
    await member.getByRole("button", { name: "변경사항 저장" }).click();
    await member.getByRole("status").getByText("프로필을 저장했습니다.").waitFor();
    await member.reload();
    assert.equal(await member.getByLabel("이름", { exact: true }).inputValue(), "베타 회원");
    assert.equal(await member.getByLabel("AtCoder 핸들").inputValue(), "beta_atcoder");
    assert.equal(await member.getByLabel("Codeforces 핸들").inputValue(), "beta-cf");
    await capturePage(member, "member-settings-mobile");
    await member.getByLabel("AtCoder 핸들").fill("");
    await member.getByLabel("Codeforces 핸들").fill("handle with spaces");
    await member.getByRole("button", { name: "변경사항 저장" }).click();
    await member.getByText(/Codeforces 핸들은 영문/u).waitFor();
    assert.equal(await member.getByLabel("Codeforces 핸들").inputValue(), "handle with spaces");
    await member.getByLabel("Codeforces 핸들").fill("");
    await member.getByRole("button", { name: "변경사항 저장" }).click();
    await member.getByRole("status").getByText("프로필을 저장했습니다.").waitFor();
    await member.reload();
    assert.equal(await member.getByLabel("AtCoder 핸들").inputValue(), "");
    assert.equal(await member.getByLabel("Codeforces 핸들").inputValue(), "");
  } finally {
    await memberContext.close();
  }
}

async function checkBoard() {
  await page.goto(`${baseUrl}/board`);
  await page.getByRole("link", { name: "로그인하고 글 쓰기" }).waitFor();
  assert.equal(await page.getByRole("navigation", { name: "태그별 글 보기" }).count(), 0);
  await page.getByRole("heading", { name: "전체 글 0", exact: true }).waitFor();
  await page.goto(`${baseUrl}/board/new`);
  await page.waitForURL(`${baseUrl}/login`);
  await authenticate(context, 2);
  await page.goto(`${baseUrl}/board/new`);
  assert.equal(await page.getByText(/작성자/u).count(), 0);
  const visualMode = page.getByRole("button", { name: "서식 편집" });
  assert.equal(await visualMode.evaluate((button) => getComputedStyle(button).boxShadow), "none");
  await page.locator("#post-title").fill("지울 초안");
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/board/new" && url.searchParams.has("draft"));
  await page.goto(baseUrl + "/board/mine");
  const newDraft = page.getByRole("link", { name: "지울 초안", exact: true });
  await newDraft.waitFor();
  await page.getByText("초안 삭제", { exact: true }).click();
  await page.getByRole("button", { name: "확인하고 삭제" }).click();
  await newDraft.waitFor({ state: "detached" });
  await page.goto(baseUrl + "/board/new");
  await page.locator("#post-title").fill("그래프 탐색 풀이를 공유해요");
  await page.getByRole("button", { name: "HTML", exact: true }).click();
  await page.getByRole("textbox", { name: "본문 HTML" }).fill("<h2>BFS 방문 처리</h2><p>큐에 넣을 때 <strong>방문 처리</strong>를 했습니다.</p><pre><code>visited[next] = true;</code></pre>");
  await captureViewport("blog-editor-html", page.getByRole("heading", { name: "글 쓰기", exact: true }));
  await page.getByRole("button", { name: "서식 편집" }).click();
  await page.locator("#post-body h2").getByText("BFS 방문 처리").waitFor();
  await captureViewport("blog-editor", page.getByRole("heading", { name: "글 쓰기", exact: true }));
  await page.getByRole("button", { name: "HTML", exact: true }).click();
  assert.match(await page.getByRole("textbox", { name: "본문 HTML" }).inputValue(), /<strong>방문 처리<\/strong>/u);
  await page.locator("#post-tags").fill("그래프, bfs");
  await page.getByRole("button", { name: "서식 편집" }).click();
  const formattedBody = page.getByRole("textbox", { name: "본문", exact: true });
  await formattedBody.press("Control+End");
  const imageUpload = waitForApi(page, "/board/media", "POST");
  await formattedBody.evaluate(async (element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 180;
    const drawing = canvas.getContext("2d");
    drawing.fillStyle = "#b9a0e7";
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.fillStyle = "#f1e9fd";
    drawing.fillRect(20, 24, 255, 132);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve));
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([blob], "graph.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
  assert.equal((await imageUpload).status(), 201);
  const image = formattedBody.locator("img");
  await image.waitFor();
  await image.evaluate((element) => element.decode());
  const mediaUrl = baseUrl + await image.getAttribute("src");
  const reader = await browser.newContext();
  try {
    assert.equal((await reader.request.get(mediaUrl)).status(), 404);
    assert.equal((await reader.request.post(baseUrl + "/board/media", { data: "anonymous" })).status(), 401);
    assert.equal((await page.request.post(baseUrl + "/board/media", { data: "missing origin" })).status(), 403);
    assert.equal((await page.request.post(baseUrl + "/board/media", { headers: { Origin: baseUrl }, data: Buffer.from("invalid image") })).status(), 415);
    assert.equal((await page.request.post(baseUrl + "/board/media", { headers: { Origin: baseUrl }, data: Buffer.alloc(5 * 1024 * 1024 + 1) })).status(), 413);
    await formattedBody.locator("[data-resize-handle=bottom-right]").scrollIntoViewIfNeeded();
    const handle = await formattedBody.locator("[data-resize-handle=bottom-right]").boundingBox();
    const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 95, start.y - 55, { steps: 8 });
    await page.mouse.up();
    await page.getByRole("button", { name: "HTML", exact: true }).click();
    const withImage = await page.getByRole("textbox", { name: "본문 HTML" }).inputValue();
    const resizedWidth = Number(withImage.match(/<img[^>]+width="(\d+)"/u)?.[1]);
    assert.ok(resizedWidth > 32 && resizedWidth < 300, "Dragging the handle must persist a smaller image width");
    await page.getByRole("button", { name: "임시저장", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/board/new" && url.searchParams.has("draft"));
    await page.getByText("임시저장했어요.", { exact: true }).waitFor();
    assert.equal((await reader.request.get(page.url())).url().endsWith("/login"), true);
    await authenticate(reader, 1);
    assert.equal((await reader.request.get(page.url())).status(), 404);
    assert.equal((await reader.request.get(mediaUrl)).status(), 404);

    await page.getByRole("link", { name: "내 글", exact: true }).click();
    await page.getByRole("link", { name: "그래프 탐색 풀이를 공유해요", exact: true }).click();
    await page.getByRole("button", { name: "미리보기", exact: true }).click();
    const preview = page.getByRole("dialog", { name: "글 미리보기" });
    await preview.getByRole("heading", { name: "그래프 탐색 풀이를 공유해요" }).waitFor();
    const previewBody = await preview.locator("[data-post-body]").innerHTML();
    assert.equal(Number(await preview.locator("img").getAttribute("width")), resizedWidth);
    await captureViewport("blog-post-preview", preview.getByRole("heading", { name: "그래프 탐색 풀이를 공유해요" }));
    const panel = preview.locator(":scope > [data-squircle-radius]");
    const desktop = await panel.boundingBox();
    assert.ok(desktop.x > 100 && desktop.y > 0, "The desktop preview must be centered");
    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await panel.boundingBox();
    assert.equal(narrow.width, desktop.width, "Narrow windows must preserve the preview's content width");
    assert.ok(await preview.evaluate((dialog) => dialog.scrollWidth > dialog.clientWidth));
    await captureViewport("blog-post-preview-narrow", preview.locator("img"));
    await page.setViewportSize({ width: 1440, height: 1024 });
    await preview.getByRole("button", { name: "편집으로 돌아가기" }).click();
    await page.getByRole("button", { name: "글 올리기" }).click();
    await page.waitForURL(/\/board\/[a-f0-9-]{36}$/u);
    assert.equal(await page.locator("[data-post-body]").innerHTML(), previewBody);
    assert.equal((await reader.request.get(mediaUrl)).headers()["content-type"], "image/webp");
  } finally {
    await reader.close();
  }
  const postUrl = page.url();
  const missingPostPage = await context.newPage();
  try {
    const missingPost = await missingPostPage.goto(baseUrl + "/board/00000000-0000-4000-8000-000000000001");
    assert.equal(missingPost?.status(), 404);
    await missingPostPage.getByRole("heading", { name: "글을 찾을 수 없어요.", exact: true }).waitFor();
    await capturePage(missingPostPage, "blog-not-found");
  } finally {
    await missingPostPage.close();
  }
  await page.getByRole("heading", { name: "그래프 탐색 풀이를 공유해요", exact: true }).waitFor();
  await page.getByRole("heading", { name: "BFS 방문 처리" }).waitFor();
  await page.locator("article strong").getByText("방문 처리").waitFor();
  await page.locator("article pre code").getByText("visited[next] = true;").waitFor();
  await capture("board-post");

  await page.goto(`${baseUrl}/`);
  const recentPosts = page.getByRole("region", { name: "최신 글" });
  await recentPosts.getByRole("link", { name: "그래프 탐색 풀이를 공유해요", exact: true }).waitFor();
  await captureViewport("home-recent-post", recentPosts);

  await checkBoardGrid();

  await page.goto(`${baseUrl}/board`);
  const search = page.getByRole("searchbox", { name: "게시글 제목 검색" });
  await search.fill("그래프 탐색");
  await search.press("Enter");
  await page.waitForURL((url) => url.searchParams.get("q") === "그래프 탐색");
  await page.getByRole("link", { name: "그래프 탐색 풀이를 공유해요", exact: true }).waitFor();
  await capture("board-search");

  await page.goto(`${baseUrl}/board?tag=bfs`);
  await page.getByRole("link", { name: "그래프 탐색 풀이를 공유해요", exact: true }).waitFor();
  await capture("board-filtered");
  await page.getByRole("link", { name: "#bfs 태그 해제" }).click();
  await page.waitForURL(`${baseUrl}/board`);
  await page.goto(postUrl);
  await page.getByRole("link", { name: "글 수정" }).click();
  await page.getByRole("heading", { name: "글 수정", exact: true }).waitFor();
  await capture("blog-edit-post");
  await page.getByRole("button", { name: "HTML", exact: true }).click();
  const source = page.getByRole("textbox", { name: "본문 HTML" });
  await source.fill(await source.inputValue() + "<p>수정한 풀이에는 시간 복잡도 O(V+E)를 추가했어요.</p>");
  await page.getByRole("button", { name: "수정한 글 저장" }).click();
  await page.waitForURL(postUrl);
  await page.getByText(/시간 복잡도 O/u).waitFor();

  await page.goto(baseUrl + "/board/mine");
  await capture("blog-my-posts");
  await page.getByRole("region", { name: "임시저장한 글" }).getByText("임시저장한 글이 없어요.").waitFor();
  const ownPost = page.getByRole("region", { name: "발행한 글" }).getByRole("listitem").filter({
    has: page.getByRole("link", { name: "그래프 탐색 풀이를 공유해요", exact: true }),
  });
  await ownPost.getByText("글 삭제", { exact: true }).click();
  await ownPost.getByRole("button", { name: "확인하고 삭제" }).click();
  await ownPost.waitFor({ state: "detached" });
  assert.equal((await page.request.get(postUrl)).status(), 404);
  assert.equal((await page.request.get(mediaUrl)).status(), 404);
  await context.clearCookies();
}

try {
  const health = await page.request.get("http://anabada-backend:3000/health");
  if (health.status() !== 200) throw new Error(`backend health returned ${health.status()}`);

  const alignmentProbe = await browser.newPage();
  try {
    await alignmentProbe.setContent(
      '<style>section{display:flex;align-items:center;gap:8px;font:16px/24px sans-serif} svg{width:16px;height:16px}</style>' +
      '<section><svg></svg>중앙 정렬</section>' +
      '<section><svg style="transform:translateY(4px)"></svg>어긋난 정렬</section>',
    );
    const [centered, offset] = await measureIconAlignment(alignmentProbe, "calibration");
    assert.equal(centered.offset, 0);
    assert.equal(offset.offset, 4);
  } finally {
    await alignmentProbe.close();
  }

  await checkSSR();
  await open("/", "ANABADA.");
  await capture("landing");
  await checkFooter();
  const navigation = page.getByRole("navigation", { name: "주요 메뉴" });
  const frame = await navigation.boundingBox();
  assert.ok(frame && Math.abs(frame.x + frame.width / 2 - page.viewportSize().width / 2) < 2, "Public navigation is centered");
  assert.equal(await navigation.getByText("랭킹", { exact: true }).count(), 0);
  await navigation.getByRole("button", { name: "대회", exact: true }).click();
  await capture("contest-menu");
  await page.getByRole("link", { name: "생각하는 프로그래밍 대회", exact: true }).click();
  await page.waitForURL(`${baseUrl}/contest#contest-series-thinking`);
  await capture("contest-archive");
  await open("/contest/2025", "2025");
  await capture("contest-2025");
  await open("/contest/2026", "2026");
  await capture("contest-2026");
  await open("/enter", "참여 안내");
  await capture("membership-guide");
  await checkAccountMenu();
  await checkBoard();
  await open("/", "실시간 활동 현황");
  await page.getByText("최근 해결한 문제", { exact: true }).waitFor();
  await page.getByText("최근 점수 획득", { exact: true }).waitFor();
  await page.getByText("이번 달 문제 해결", { exact: true }).waitFor();
  await capture("home-ranking-activity");

  await captureViewport("monthly-statistics", page.getByText("월별 문제 해결 통계", { exact: true }));

  await page.getByText("현재 진행중인 이벤트", { exact: false }).scrollIntoViewIfNeeded();
  await capture("events");

  await page.goto(`${baseUrl}/user/1`);
  await assertUserProfile(page);
  await capture("user-profile");
  await page.getByRole("link", { name: "홈으로", exact: true }).press("Enter");
  await page.waitForURL(`${baseUrl}/`);
  await assertProfileErrors(context, "");

  const unauthenticated = await page.request.get(`${baseUrl}/api/admin/ranking-boards?page=1&limit=10`);
  assert.equal(unauthenticated.status(), 401);
  await open("/admin", "solved.ac");
  await page.waitForURL(`${baseUrl}/login`);
  await capture("solved-ac-login");
  await authenticate(context, 2);
  await page.goto(`${baseUrl}/admin`);
  await page.waitForURL(`${baseUrl}/login?error=admin_required`);
  await authenticate(context);
  await open("/login", "게시판으로 이동");
  await capture("signed-in-login");
  await page.goto(`${baseUrl}/board`);
  await page.getByRole("button", { name: "alpha", exact: true }).click();
  const adminDashboardLink = page.getByRole("link", { name: "관리자 대시보드", exact: true });
  await adminDashboardLink.waitFor();
  await captureViewport("admin-appbar", page.getByRole("banner").first());
  const dashboardUsers = waitForApi(page, "/api/users/all");
  const dashboardEvents = waitForApi(page, "/api/events?status=active&limit=1");
  await adminDashboardLink.click();
  await page.waitForURL(`${baseUrl}/admin`);
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
  const addWebhook = page.getByRole("button", { name: "Webhook 추가", exact: true });
  await addWebhook.click();
  await page.getByRole("dialog").getByRole("button", { name: "추가", exact: true }).click();
  await page.keyboard.press("Escape");
  const webhookError = page.getByRole("alert").filter({ hasText: "URL을 입력해주세요." });
  await webhookError.waitFor();
  await capture("admin-webhook-error");
  iconAlignment.push(await measureIconPair(webhookError, {
    state: "admin-webhook-error", icon: "button svg.lucide-x", label: ":scope > span",
  }));
  await webhookError.getByRole("button", { name: "오류 메시지 닫기" }).click();
  await webhookError.waitFor({ state: "hidden" });
  await addWebhook.click();
  await page.locator("#url").fill("https://created.invalid/hook");
  const hookCreate = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/hooks" && response.request().method() === "POST";
  });
  await page.getByRole("button", { name: "추가", exact: true }).click();
  if ((await hookCreate).status() !== 200) throw new Error("webhook creation failed");
  await page.getByText("https://created.invalid/hook", { exact: true }).waitFor();
  await capture("admin-hooks");
  const hookUrls = page.getByRole("cell").filter({ has: page.getByRole("button", { name: "Webhook 주소 열기" }) });
  for (const row of await hookUrls.all()) {
    iconAlignment.push(await measureIconPair(row.locator(":scope > div"), {
      state: "admin-hooks", icon: "button svg.lucide-external-link", label: ":scope > span",
    }));
  }

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
  await capture("admin-ranking-board-detail");
  await page.getByRole("button", { name: "활성화", exact: true }).click();
  await page.getByRole("dialog").getByRole("heading", { name: "추첨 보드를 활성화할까요?", exact: true }).waitFor();
  await capture("admin-ranking-board-confirmation");
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
  const restoreOriginal = await page.request.patch(`${baseUrl}/api/admin/ranking-boards/${originalActiveBoard.id}/active`, { headers: { Origin: baseUrl }, data: { is_active: true } });
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
  await capture("admin-event-edit-dialog");
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
  await activeEvent.getByRole("button", { name: "삭제", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await capture("admin-event-delete-dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
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
  await capture("admin-event-created");
  const newEventDetail = await readApi(page.request.get(`${baseUrl}/api/events/${createdEvent.event_id}`));
  assert.equal(newEventDetail.data.title, eventTitle);
  assert.deepEqual(newEventDetail.data.problems, [1000, 1001]);

  for (const section of ["활동 로그", "시스템 로그", "접속 기록", "알림 관리"]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    await page.getByRole("heading", { name: section, exact: true }).waitFor();
    await page.getByText("해당 기능은 추후 구현 예정입니다.", { exact: true }).waitFor();
  }
  const logout = waitForApi(page, "/auth/logout", "POST");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  assert.equal((await logout).status(), 303);
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
    await mobilePage.getByRole("button", { name: menuLabel, exact: true }).click();
    await mobilePage.getByRole("heading", { name: heading, exact: true }).waitFor();
    await mobilePage.waitForTimeout(350);
  };

  await openMobile("/", "ANABADA.");
  await checkPublicChrome(mobilePage);
  await capturePage(mobilePage, "mobile-landing");
  await openMobile("/board", "블로그");
  await capturePage(mobilePage, "mobile-board");
  await openMobile("/contest/2025", "대회 일정");
  await capturePage(mobilePage, "narrow-contest-2025");
  await openMobile("/contest/2026", "2026");
  await capturePage(mobilePage, "narrow-contest-2026");
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

  await openMobile("/user/1", "사용자 프로필");
  await assertUserProfile(mobilePage);
  await capturePage(mobilePage, "mobile-user-profile");
  await assertProfileErrors(mobileContext, "mobile-");

  await openMobile("/login", "로그인");
  await capturePage(mobilePage, "mobile-login");
  await authenticate(mobileContext);
  const mobileUsers = waitForApi(mobilePage, "/api/users/all");
  const mobileEvents = waitForApi(mobilePage, "/api/events?status=active&limit=1");
  await mobilePage.goto(`${baseUrl}/admin`);
  await mobilePage.getByRole("heading", { name: "대시보드", exact: true }).waitFor();
  await checkAdminOverview(mobilePage, mobileUsers, mobileEvents);
  assert.equal(await mobilePage.getByRole("button", { name: "관리자 메뉴 열기", exact: true }).count(), 0);
  await capturePage(mobilePage, "mobile-admin-dashboard");

  await selectMobileAdminSection("유저 목록", "유저 목록");
  await capturePage(mobilePage, "mobile-admin-users");
  await selectMobileAdminSection("점수 관리", "점수 관리");
  await capturePage(mobilePage, "mobile-admin-score");
  await selectMobileAdminSection("웹훅 관리", "Webhook 관리");
  const mobileIgnoredHook = mobilePage.locator("tr", { hasText: "https://ignored.invalid/hook" });
  await mobileIgnoredHook.getByText("비활성화", { exact: true }).waitFor();
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

  const misalignedIcons = iconAlignment.filter(({ offset }) => Math.abs(offset) > 0.5);
  assert.equal(misalignedIcons.length, 0, JSON.stringify(misalignedIcons.slice(0, 12), null, 2));
  if (consoleFailures.length > 0) throw new Error(`browser console errors: ${consoleFailures.join(" | ")}`);
  if (pageFailures.length > 0) throw new Error(`uncaught page errors: ${pageFailures.join(" | ")}`);
  if (serverFailures.length > 0) throw new Error(`unexpected 5xx responses: ${serverFailures.join(" | ")}`);
  if (clientFailures.length > 0) throw new Error(`unexpected API 4xx responses: ${clientFailures.join(" | ")}`);
} finally {
  await writeFile(join(artifactDirectory, "icon-alignment.json"), JSON.stringify(iconAlignment, null, 2));
  await mobileContext?.close();
  await context.close();
  await browser.close();
}
