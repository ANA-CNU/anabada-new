import { decodeSubmissionPayload } from "./jungol-wire.mjs";
import { needsLogin } from "./auth-state.mjs";

const GROUP_ID = "1125";
const GROUP_RANK_URL = `https://jungol.co.kr/group/${GROUP_ID}/rank`;
const GROUP_SUBMISSION_URL = `https://jungol.co.kr/group/${GROUP_ID}/submission`;

async function waitForRows(page) {
  const table = page.getByRole("table").first();
  await table.waitFor({ state: "visible", timeout: 20_000 });
  await table.locator("tr").nth(1).waitFor({ state: "visible", timeout: 20_000 });
  return table;
}

export async function ensureLogin(page, credentials) {
  await page.goto(GROUP_SUBMISSION_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  const loginRequired = await page
    .getByText(/로그인이 필요해요|그룹에 가입해야 해요/)
    .first()
    .isVisible()
    .catch(() => false);
  if (!needsLogin({ url: page.url(), loginRequiredVisible: loginRequired })) {
    return false;
  }

  if (!page.url().includes("/auth/signin")) {
    await page.goto(
      "https://jungol.co.kr/auth/signin?next=L2dyb3VwLzExMjUvc3VibWlzc2lvbg==",
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
  }
  await page.getByLabel("아이디", { exact: true }).fill(credentials.username);
  await page.getByLabel("암호", { exact: true }).fill(credentials.password);
  const rememberMe = page.getByRole("checkbox", { name: "로그인 유지" });
  if (await rememberMe.isVisible().catch(() => false)) await rememberMe.check();
  await Promise.all([
    page.waitForURL(/\/group\/1125\/submission/, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    }),
    page.getByRole("button", { name: "로그인", exact: true }).click(),
  ]);
  await waitForRows(page);
  return true;
}

export async function crawlRank(page) {
  await page.goto(GROUP_RANK_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  const table = await waitForRows(page);
  const rows = await table.locator("tr").all();
  const accounts = [];
  for (const row of rows.slice(1)) {
    const cells = await row.locator("td").allTextContents();
    const href = await row
      .locator('a[href*="/account/"]')
      .first()
      .getAttribute("href");
    const accountId = href?.match(/\/account\/(\d+)/)?.[1];
    const handle = cells[1]?.trim().split(/\s+/)[0];
    const solvedCount = Number(cells[2]?.replace(/[^0-9]/g, ""));
    const wrongCount = Number(cells[3]?.replace(/[^0-9]/g, ""));
    const rating = Number(cells[5]?.replace(/[^0-9]/g, ""));
    if (!accountId || !handle || !Number.isFinite(solvedCount)) continue;
    accounts.push({
      accountId,
      handle,
      solvedCount,
      wrongCount: Number.isFinite(wrongCount) ? wrongCount : 0,
      rating: Number.isFinite(rating) ? rating : 0,
    });
  }
  if (accounts.length === 0) throw new Error("rank_accounts_empty");
  return accounts;
}

function isSubmissionResponse(response) {
  return new URL(response.url()).pathname === "/api/submission";
}

async function decodeResponse(response) {
  const [body, headers] = await Promise.all([
    response.body(),
    response.request().allHeaders(),
  ]);
  return decodeSubmissionPayload(body, headers["x-fp"] ?? "");
}

export async function crawlAccountSubmissions(context, job) {
  const page = await context.newPage();
  try {
    const initialResponse = page.waitForResponse(isSubmissionResponse, {
      timeout: 30_000,
    });
    await page.goto(
      `https://jungol.co.kr/account/${job.account.accountId}/submission`,
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    await waitForRows(page);

    const attemptsById = new Map();
    let batch = await decodeResponse(await initialResponse);
    let pageCount = 1;
    let cursorReached = false;
    while (true) {
      for (const attempt of batch.attempts) {
        attemptsById.set(attempt.submissionId, attempt);
        if (
          job.lastSubmissionId > 0n &&
          BigInt(attempt.submissionId) <= job.lastSubmissionId
        ) {
          cursorReached = true;
        }
      }
      if (cursorReached && job.lastSubmissionId > 0n) break;
      if (!batch.paging.more) {
        cursorReached = true;
        break;
      }
      if (pageCount >= job.maxPages) {
        throw new Error("max_pages_reached_before_cursor");
      }

      const loadMore = page.getByRole("button", {
        name: "더 불러오기",
        exact: true,
      });
      await loadMore.waitFor({ state: "visible", timeout: 20_000 });
      const nextResponse = page.waitForResponse(isSubmissionResponse, {
        timeout: 30_000,
      });
      await loadMore.click();
      batch = await decodeResponse(await nextResponse);
      pageCount += 1;
    }

    const attempts = [...attemptsById.values()]
      .filter(
        (attempt) =>
          job.lastSubmissionId === 0n ||
          BigInt(attempt.submissionId) > job.lastSubmissionId,
      )
      .sort((left, right) => Number(left.submissionId) - Number(right.submissionId));
    return { attempts, pageCount, cursorReached };
  } finally {
    await page.close();
  }
}
