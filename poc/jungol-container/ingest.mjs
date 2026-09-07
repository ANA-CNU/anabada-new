import { createInterface } from "node:readline";
import { chromium } from "playwright";
import {
  crawlAccountSubmissions,
  crawlRank,
  ensureLogin,
} from "./jungol-browser.mjs";
import {
  completeSyncRun,
  createSyncRun,
  failSyncRun,
  loadStoredUsers,
  openPool,
  persistAccount,
} from "./jungol-store.mjs";

const PROFILE_PATH = "/tmp/jungol-ingest-profile";

function positiveInteger(rawValue, fallback) {
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
    throw new Error("missing_credentials");
  }
  return { username: lines[0], password: lines[1] };
}

async function runWorkerPool(items, workerCount, worker) {
  let nextIndex = 0;
  const results = [];
  const workers = Array.from(
    { length: Math.min(workerCount, items.length) },
    async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= items.length) return;
        results[currentIndex] = await worker(items[currentIndex]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function main() {
  let credentials = await readCredentials();
  const maxWorkers = positiveInteger(process.env.POC_MAX_WORKERS, 2);
  const maxPages = positiveInteger(process.env.POC_MAX_PAGES, 20);
  const targetAccountId = process.env.POC_TARGET_ACCOUNT_ID?.trim() ?? "";
  const pool = openPool(maxWorkers);
  const context = await chromium.launchPersistentContext(PROFILE_PATH, {
    headless: true,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  let runId;

  try {
    const controlPage = context.pages()[0] ?? (await context.newPage());
    const loginPerformed = await ensureLogin(controlPage, credentials);
    credentials = { username: "", password: "" };
    const rankAccounts = await crawlRank(controlPage);
    runId = await createSyncRun(pool, rankAccounts.length);
    const storedByAccountId = await loadStoredUsers(pool);
    const changedAccounts = rankAccounts.filter((account) => {
      const stored = storedByAccountId.get(account.accountId);
      return !stored || account.solvedCount > stored.corrects;
    });
    const decreasedAccounts = rankAccounts.filter((account) => {
      const stored = storedByAccountId.get(account.accountId);
      return stored && account.solvedCount < stored.corrects;
    });
    const selectedAccounts = targetAccountId
      ? changedAccounts.filter((account) => account.accountId === targetAccountId)
      : changedAccounts;

    const workerResults = await runWorkerPool(
      selectedAccounts,
      maxWorkers,
      async (account) => {
        console.error(
          JSON.stringify({ event: "worker_started", accountId: account.accountId }),
        );
        const stored = storedByAccountId.get(account.accountId);
        const crawlResult = await crawlAccountSubmissions(context, {
          account,
          lastSubmissionId: BigInt(stored?.solution ?? 0),
          maxPages,
        });
        const result = await persistAccount(pool, account, crawlResult);
        console.error(
          JSON.stringify({
            event: "worker_committed",
            accountId: account.accountId,
            insertedAttemptCount: result.insertedAttemptCount,
            committedCursor: result.committedCursor,
          }),
        );
        return result;
      },
    );
    const insertedAttemptCount = workerResults.reduce(
      (sum, result) => sum + result.insertedAttemptCount,
      0,
    );
    await completeSyncRun(pool, {
      id: runId,
      changedAccountCount: changedAccounts.length,
      workerCount: selectedAccounts.length,
      insertedAttemptCount,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          loginPerformed,
          database: "jungol_bada",
          rankAccountCount: rankAccounts.length,
          changedAccountCount: changedAccounts.length,
          selectedWorkerCount: selectedAccounts.length,
          decreasedAccountCount: decreasedAccounts.length,
          maxWorkers,
          results: workerResults,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (runId) await failSyncRun(pool, runId, error);
    throw error;
  } finally {
    credentials = { username: "", password: "" };
    await context.close();
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message.slice(0, 500) : "unknown";
  console.error(JSON.stringify({ ok: false, message }, null, 2));
  process.exitCode = 1;
});
