import { createInterface } from "node:readline";
import { chromium } from "playwright";

const GROUP_ID = "1125";
const GROUP_RANK_URL = `https://jungol.co.kr/group/${GROUP_ID}/rank`;
const GROUP_SUBMISSION_URL = `https://jungol.co.kr/group/${GROUP_ID}/submission`;
const PROFILE_PATH = "/tmp/jungol-poc-profile";
const NAVIGATION_TIMEOUT_MS = 30_000;
const CONTENT_TIMEOUT_MS = 20_000;

class PocError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PocError";
    this.code = code;
  }
}

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
    throw new PocError(
      "missing_credentials",
      "Expected username and password as two non-empty stdin lines.",
    );
  }

  return { username: lines[0], password: lines[1] };
}

async function isChallengePage(page) {
  const [title, bodyText] = await Promise.all([
    page.title().catch(() => ""),
    page.locator("body").innerText({ timeout: 5_000 }).catch(() => ""),
  ]);

  return /just a moment|verify you are human|cloudflare|captcha/i.test(
    `${title}\n${bodyText}`,
  );
}

async function waitForTableRows(page, minimumRows) {
  const deadline = Date.now() + CONTENT_TIMEOUT_MS;
  const table = page.getByRole("table").first();

  await table.waitFor({ state: "visible", timeout: CONTENT_TIMEOUT_MS });

  while (Date.now() < deadline) {
    const rowCount = await table.getByRole("row").count();
    if (rowCount >= minimumRows) {
      return { table, rowCount };
    }
    await page.waitForTimeout(250);
  }

  throw new PocError(
    "table_rows_timeout",
    `Expected at least ${minimumRows} table rows before timeout.`,
  );
}

async function assertAuthenticatedGroupPage(page) {
  if (await isChallengePage(page)) {
    throw new PocError("challenge", "Cloudflare or CAPTCHA challenge detected.");
  }

  if (page.url().includes("/auth/signin")) {
    throw new PocError("not_authenticated", "Redirected to the sign-in page.");
  }

  const body = page.locator("body");
  const loginRequired = await body
    .getByText(/로그인이 필요해요|그룹에 가입해야 해요/)
    .first()
    .isVisible()
    .catch(() => false);

  if (loginRequired) {
    throw new PocError(
      "group_access_denied",
      "The page requires login or group membership.",
    );
  }

  const groupHeading = page.getByRole("heading", { name: "ANA", exact: true });
  await groupHeading.waitFor({ state: "visible", timeout: CONTENT_TIMEOUT_MS });
}

async function loginIfNeeded(page, username, password) {
  await page.goto(GROUP_SUBMISSION_URL, {
    waitUntil: "domcontentloaded",
    timeout: NAVIGATION_TIMEOUT_MS,
  });

  if (await isChallengePage(page)) {
    throw new PocError("challenge", "Challenge detected before login.");
  }

  const needsLogin =
    page.url().includes("/auth/signin") ||
    (await page
      .getByRole("heading", { name: "로그인이 필요해요." })
      .isVisible()
      .catch(() => false));

  if (!needsLogin) {
    await assertAuthenticatedGroupPage(page);
    return false;
  }

  if (!page.url().includes("/auth/signin")) {
    await page.goto(
      `https://jungol.co.kr/auth/signin?next=${Buffer.from(`/group/${GROUP_ID}/submission`).toString("base64")}`,
      { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS },
    );
  }

  await page.getByLabel("아이디", { exact: true }).fill(username);
  await page.getByLabel("암호", { exact: true }).fill(password);

  const rememberMe = page.getByRole("checkbox", { name: "로그인 유지" });
  if (await rememberMe.isVisible().catch(() => false)) {
    await rememberMe.check();
  }

  await Promise.all([
    page.waitForURL(new RegExp(`/group/${GROUP_ID}/submission`), {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    }),
    page.getByRole("button", { name: "로그인", exact: true }).click(),
  ]);

  await assertAuthenticatedGroupPage(page);
  return true;
}

async function inspectSubmissionPage(page) {
  await assertAuthenticatedGroupPage(page);
  const { table, rowCount } = await waitForTableRows(page, 2);
  const headerText = await table.getByRole("row").first().innerText();
  const requiredHeaders = [
    "번호",
    "제출자",
    "문제",
    "결과",
    "시간",
    "메모리",
    "길이",
    "언어",
    "시각",
  ];

  if (!requiredHeaders.every((header) => headerText.includes(header))) {
    throw new PocError(
      "submission_schema_changed",
      "The submission table is missing one or more required headers.",
    );
  }

  const firstColumnTexts = await table
    .locator("tr td:first-child")
    .allTextContents();
  const numericSubmissionCount = firstColumnTexts.filter((text) =>
    /^\s*\d+/.test(text),
  ).length;

  if (numericSubmissionCount === 0) {
    throw new PocError(
      "no_submission_ids",
      "No numeric submission IDs were found in the group table.",
    );
  }

  return {
    tableRowsIncludingHeader: rowCount,
    numericSubmissionCount,
    collapsedPlusNRows: firstColumnTexts.filter((text) => /\+\d+/.test(text))
      .length,
    loadMoreVisible: await page
      .getByRole("button", { name: "더 불러오기", exact: true })
      .isVisible()
      .catch(() => false),
  };
}

async function inspectRankPage(page) {
  await page.goto(GROUP_RANK_URL, {
    waitUntil: "domcontentloaded",
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  await assertAuthenticatedGroupPage(page);

  const { table, rowCount } = await waitForTableRows(page, 2);
  const accountLinks = await table.locator('a[href*="/account/"]').all();
  const accountHrefs = await Promise.all(
    accountLinks.map((link) => link.getAttribute("href")),
  );
  const uniqueAccountIds = new Set(
    accountHrefs
      .filter((href) => href !== null)
      .map((href) => href.match(/\/account\/(\d+)/)?.[1])
      .filter((accountId) => accountId !== undefined),
  );

  if (uniqueAccountIds.size === 0) {
    throw new PocError(
      "no_group_accounts",
      "No numeric account IDs were found in the group rank table.",
    );
  }

  return {
    tableRowsIncludingHeader: rowCount,
    uniqueAccountCount: uniqueAccountIds.size,
  };
}

async function launchContext() {
  return chromium.launchPersistentContext(PROFILE_PATH, {
    headless: true,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1280, height: 900 },
  });
}

async function main() {
  let { username, password } = await readCredentials();
  let context;

  try {
    context = await launchContext();
    const page = context.pages()[0] ?? (await context.newPage());
    const loginPerformed = await loginIfNeeded(page, username, password);
    username = "";
    password = "";

    const submission = await inspectSubmissionPage(page);
    const rank = await inspectRankPage(page);
    await context.close();
    context = undefined;

    const restartedContext = await launchContext();
    context = restartedContext;
    const restartedPage =
      restartedContext.pages()[0] ?? (await restartedContext.newPage());
    await restartedPage.goto(GROUP_SUBMISSION_URL, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await assertAuthenticatedGroupPage(restartedPage);
    const restartedSubmission = await inspectSubmissionPage(restartedPage);

    console.log(
      JSON.stringify(
        {
          ok: true,
          runtime: {
            platform: process.platform,
            architecture: process.arch,
            headless: true,
          },
          loginPerformed,
          groupSubmission: submission,
          groupRank: rank,
          sessionSurvivedBrowserRestart: restartedSubmission.numericSubmissionCount > 0,
        },
        null,
        2,
      ),
    );
  } finally {
    username = "";
    password = "";
    await context?.close().catch(() => undefined);
  }
}

main().catch((error) => {
  const code = error instanceof PocError ? error.code : "unexpected_error";
  const message =
    error instanceof Error ? error.message.slice(0, 400) : "Unknown failure";
  console.error(JSON.stringify({ ok: false, code, message }, null, 2));
  process.exitCode = 1;
});
