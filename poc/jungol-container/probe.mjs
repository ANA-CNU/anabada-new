import { createInterface } from "node:readline";
import { chromium } from "playwright";
import { needsLogin } from "./auth-state.mjs";

const GROUP_SUBMISSION_URL = "https://jungol.co.kr/group/1125/submission";
const ACCOUNT_SUBMISSION_URL = "https://jungol.co.kr/account/153884/submission";
const PROFILE_PATH = "/tmp/jungol-probe-profile";
let failureDiagnostics = { stage: "startup" };

async function readCredentials() {
  const lines = [];
  const reader = createInterface({ input: process.stdin, terminal: false });
  for await (const line of reader) {
    lines.push(line.replace(/\r$/, ""));
    if (lines.length === 2) {
      reader.close();
      break;
    }
  }
  if (lines.length !== 2 || !lines[0] || !lines[1]) {
    throw new Error("missing_credentials");
  }
  return { username: lines[0], password: lines[1] };
}

function summarizeJson(value, depth = 0) {
  if (depth >= 4) {
    return Array.isArray(value) ? "array" : typeof value;
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      item: value.length > 0 ? summarizeJson(value[0], depth + 1) : null,
    };
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        summarizeJson(child, depth + 1),
      ]),
    );
  }
  return value === null ? "null" : typeof value;
}

function sanitizedUrl(rawUrl) {
  const url = new URL(rawUrl);
  const queryKeys = [...new Set(url.searchParams.keys())].sort();
  return `${url.origin}${url.pathname}${queryKeys.length > 0 ? `?${queryKeys.join("&")}` : ""}`;
}

async function ensureLogin(page, username, password) {
  await page.goto(GROUP_SUBMISSION_URL, { waitUntil: "domcontentloaded" });
  const loginRequiredVisible = await page
    .getByText(/로그인이 필요해요|그룹에 가입해야 해요/)
    .first()
    .isVisible()
    .catch(() => false);
  if (
    !needsLogin({
      url: page.url(),
      loginRequiredVisible,
    })
  ) {
    return false;
  }

  if (!page.url().includes("/auth/signin")) {
    await page.goto(
      "https://jungol.co.kr/auth/signin?next=L2dyb3VwLzExMjUvc3VibWlzc2lvbg==",
      { waitUntil: "domcontentloaded" },
    );
  }

  await page.getByLabel("아이디", { exact: true }).fill(username);
  await page.getByLabel("암호", { exact: true }).fill(password);
  const rememberMe = page.getByRole("checkbox", { name: "로그인 유지" });
  if (await rememberMe.isVisible().catch(() => false)) {
    await rememberMe.check();
  }
  await Promise.all([
    page.waitForURL(/\/group\/1125\/submission/, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    }),
    page.getByRole("button", { name: "로그인", exact: true }).click(),
  ]);
  return true;
}

async function waitForSubmissionRows(page) {
  const table = page.getByRole("table").first();
  await table.waitFor({ state: "visible", timeout: 20_000 });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if ((await table.getByRole("row").count()) >= 2) {
      return table;
    }
    await page.waitForTimeout(250);
  }
  throw new Error("submission_rows_timeout");
}

async function collectFailureDiagnostics(page, stage) {
  const rawUrl = page.url();
  const url = new URL(rawUrl);
  return {
    stage,
    origin: url.origin,
    path: url.pathname,
    title: await page.title().catch(() => ""),
    tableCount: await page.getByRole("table").count().catch(() => -1),
    signInVisible: await page
      .getByRole("button", { name: "로그인", exact: true })
      .isVisible()
      .catch(() => false),
    accessDeniedVisible: await page
      .getByText(/로그인이 필요해요|그룹에 가입해야 해요/)
      .first()
      .isVisible()
      .catch(() => false),
    challengeVisible: await page
      .getByText(/just a moment|verify you are human|captcha/i)
      .first()
      .isVisible()
      .catch(() => false),
  };
}

async function main() {
  let { username, password } = await readCredentials();
  let stage = "launch_context";
  const context = await chromium.launchPersistentContext(PROFILE_PATH, {
    headless: true,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const captured = [];
  const pending = new Set();

  page.on("response", (response) => {
    const request = response.request();
    const resourceType = request.resourceType();
    if (resourceType !== "xhr" && resourceType !== "fetch") {
      return;
    }

    const job = (async () => {
      const contentType = response.headers()["content-type"] ?? "";
      const record = {
        url: sanitizedUrl(response.url()),
        method: request.method(),
        status: response.status(),
        resourceType,
        contentType: contentType.split(";", 1)[0],
      };
      if (contentType.includes("json")) {
        record.schema = summarizeJson(await response.json().catch(() => null));
      }
      captured.push(record);
    })();
    pending.add(job);
    void job.finally(() => pending.delete(job));
  });

  try {
    stage = "login";
    const loginPerformed = await ensureLogin(page, username, password);
    username = "";
    password = "";

    stage = "group_navigation";
    await page.goto(GROUP_SUBMISSION_URL, { waitUntil: "domcontentloaded" });
    stage = "group_table";
    const groupTable = await waitForSubmissionRows(page);
    const groupRowsBefore = await groupTable.getByRole("row").count();
    const groupLoadMore = page.getByRole("button", {
      name: "더 불러오기",
      exact: true,
    });
    if (await groupLoadMore.isVisible().catch(() => false)) {
      stage = "group_load_more";
      await groupLoadMore.click();
      await page.waitForTimeout(1_000);
    }
    const groupRowsAfter = await groupTable.getByRole("row").count();

    stage = "account_navigation";
    await page.goto(ACCOUNT_SUBMISSION_URL, { waitUntil: "domcontentloaded" });
    stage = "account_table";
    const accountTable = await waitForSubmissionRows(page);
    const accountRowsBefore = await accountTable.getByRole("row").count();
    const accountLoadMore = page.getByRole("button", {
      name: "더 불러오기",
      exact: true,
    });
    if (await accountLoadMore.isVisible().catch(() => false)) {
      stage = "account_load_more";
      await accountLoadMore.click();
      await page.waitForTimeout(1_000);
    }
    const accountRowsAfter = await accountTable.getByRole("row").count();

    stage = "network_settle";
    await Promise.allSettled([...pending]);
    const uniqueRecords = [
      ...new Map(
        captured.map((record) => [
          `${record.method}|${record.status}|${record.url}|${JSON.stringify(record.schema ?? null)}`,
          record,
        ]),
      ).values(),
    ];

    console.log(
      JSON.stringify(
        {
          ok: true,
          loginPerformed,
          rows: {
            group: { before: groupRowsBefore, after: groupRowsAfter },
            account: { before: accountRowsBefore, after: accountRowsAfter },
          },
          network: uniqueRecords,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    failureDiagnostics = await collectFailureDiagnostics(page, stage).catch(() => ({
      stage,
      diagnosticsUnavailable: true,
    }));
    throw error;
  } finally {
    username = "";
    password = "";
    await context.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message.slice(0, 300) : "unknown";
  console.error(
    JSON.stringify({ ok: false, message, diagnostics: failureDiagnostics }, null, 2),
  );
  process.exitCode = 1;
});
