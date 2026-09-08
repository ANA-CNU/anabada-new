import { mkdir } from "node:fs/promises";
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
  await page.getByText("사용자 프로필", { exact: true }).waitFor();
  await page.getByText("정답 수", { exact: true }).waitFor();
  await capture("user-profile");

  await open("/login", "로그인");
  await page.locator("#username").fill("smoke-admin");
  await page.locator("#password").fill("smoke-password");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL(`${baseUrl}/admin`, { timeout: 10_000 });
  await page.getByRole("heading", { name: "대시보드", exact: true }).waitFor();

  await page.getByRole("button", { name: "유저 목록", exact: true }).click();
  await page.getByText("유저 정보를 조회·수정·삭제합니다.", { exact: false }).waitFor();
  await capture("admin-users");

  await page.getByRole("button", { name: "점수 관리", exact: true }).click();
  await page.getByRole("heading", { name: "점수 관리", exact: true }).waitFor();
  await capture("admin-score");

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
  await mobilePage.getByText("사용자 프로필", { exact: true }).waitFor();
  await capturePage(mobilePage, "mobile-user-profile");

  await openMobile("/login", "로그인");
  await mobilePage.locator("#username").fill("smoke-admin");
  await mobilePage.locator("#password").fill("smoke-password");
  await mobilePage.getByRole("button", { name: "로그인", exact: true }).click();
  await mobilePage.waitForURL(`${baseUrl}/admin`, { timeout: 10_000 });
  await mobilePage.getByRole("heading", { name: "대시보드", exact: true }).waitFor();

  await selectMobileAdminSection("유저 목록", "유저 목록");
  await capturePage(mobilePage, "mobile-admin-users");
  await selectMobileAdminSection("점수 관리", "점수 관리");
  await capturePage(mobilePage, "mobile-admin-score");
  await selectMobileAdminSection("웹훅 관리", "Webhook 관리");
  await mobilePage.getByText("비활성화", { exact: true }).waitFor();
  await capturePage(mobilePage, "mobile-admin-hooks");
  await selectMobileAdminSection("이벤트 목록", "이벤트 목록");
  await capturePage(mobilePage, "mobile-admin-events");

  if (consoleFailures.length > 0) throw new Error(`browser console errors: ${consoleFailures.join(" | ")}`);
  if (pageFailures.length > 0) throw new Error(`uncaught page errors: ${pageFailures.join(" | ")}`);
  if (serverFailures.length > 0) throw new Error(`unexpected 5xx responses: ${serverFailures.join(" | ")}`);
  if (clientFailures.length > 0) throw new Error(`unexpected API 4xx responses: ${clientFailures.join(" | ")}`);
} finally {
  await mobileContext?.close();
  await context.close();
  await browser.close();
}
