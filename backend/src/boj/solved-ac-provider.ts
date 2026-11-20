import { setTimeout } from "node:timers/promises";
import { z } from "zod";
import {
  type DatabaseExecutor,
  type DatabasePool,
  defineSqlOperation,
} from "../infrastructure/mysql/database-session.js";

export const minimumSolvedAcGapSeconds = 2;
// The browser may spend up to 10 seconds each on startup and navigation.
const reservationSeconds = 25;
const forbiddenRetrySeconds = 86_400;
const providerAvailable = defineSqlOperation("boj.tier_provider_available");
const updateProvider = defineSqlOperation("boj.update_tier_provider");
const readProviderDelay = defineSqlOperation("boj.read_solved_ac_delay");
const providerRow = z.object({ id: z.literal(1) });

export type SolvedAcFailure =
  | { readonly kind: "retry"; readonly delay: number }
  | { readonly kind: "cooldown"; readonly delay: number }
  | { readonly kind: "blocked" };

export async function waitForSolvedAcSlot(
  pool: DatabasePool,
  signal: AbortSignal,
): Promise<boolean> {
  const row = await pool.withSession((db) =>
    db.selectOne(
      readProviderDelay,
      "SELECT GREATEST(0,TIMESTAMPDIFF(MICROSECOND,UTC_TIMESTAMP(3),next_at)) AS delay_us FROM boj_tier_provider WHERE id=1",
      [],
      z.object({ delay_us: z.coerce.number().int().nonnegative() }),
    ),
  );
  if (!row || row.delay_us > minimumSolvedAcGapSeconds * 1_000_000)
    return false;
  if (row.delay_us > 0)
    await setTimeout(Math.ceil(row.delay_us / 1_000) + 1, undefined, {
      signal,
    });
  return (await claimSolvedAcJob(pool, async () => true)) === true;
}

// Callers hold the solved.ac advisory lock from claim through the result write.
export function claimSolvedAcJob<Job>(
  pool: DatabasePool,
  find: (db: DatabaseExecutor) => Promise<Job | undefined>,
): Promise<Job | undefined> {
  return pool.unitOfWork(async (db) => {
    const provider = await db.selectOne(
      providerAvailable,
      "SELECT id FROM boj_tier_provider WHERE id=1 AND next_at<=UTC_TIMESTAMP(3) FOR UPDATE",
      [],
      providerRow,
    );
    if (!provider) return undefined;
    const job = await find(db);
    if (job !== undefined)
      await db.execute(
        updateProvider,
        "UPDATE boj_tier_provider SET next_at=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE id=1",
        [reservationSeconds],
      );
    return job;
  });
}

export async function finishSolvedAcRequest(
  db: DatabaseExecutor,
  outcome: SolvedAcFailure | { readonly kind: "resolved" | "missing" },
): Promise<void> {
  const delay =
    outcome.kind === "blocked"
      ? forbiddenRetrySeconds
      : outcome.kind === "cooldown"
        ? Math.max(minimumSolvedAcGapSeconds, outcome.delay)
        : minimumSolvedAcGapSeconds;
  await db.execute(
    updateProvider,
    "UPDATE boj_tier_provider SET next_at=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)),blocked=? WHERE id=1",
    [delay, outcome.kind === "blocked"],
  );
}

export function retryAfterSeconds(
  header: string | null,
  now: number,
  fallback: number,
): number {
  const value = header ?? "";
  const seconds = /^\d{1,9}$/.test(value)
    ? Number(value)
    : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isFinite(seconds)
    ? Math.max(minimumSolvedAcGapSeconds, seconds)
    : fallback;
}
