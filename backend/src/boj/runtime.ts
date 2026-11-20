import { z } from "zod";
import type { InternalIncidentReporter } from "../emergency-webhook.js";
import {
  type DatabasePool,
  defineSqlOperation,
} from "../infrastructure/mysql/database-session.js";
import type { InitializedDatabase } from "../infrastructure/mysql/pool-factory.js";
import { HealthRepository } from "../infrastructure/mysql/repositories/health-repository.js";
import { logger } from "../logger.js";
import { BojCycleRunner } from "./cycle.js";
import { BojIncidents } from "./incident.js";
import { BojPageReader } from "./page-reader.js";
import { BojRankingNotifications } from "./ranking-notifications.js";
import { BojRankingProjection } from "./ranking-projection.js";
import {
  SolvedAcCollector,
  type SolvedAcCollectorOptions,
} from "./solved-ac-collector.js";
import type { SolvedAcCredentials } from "./solved-ac.js";

const fiveMinutesMs = 300_000;
const checkMigrationTable = defineSqlOperation("boj.check_migration_table");
const presentRow = z.object({ present: z.coerce.number().pipe(z.literal(1)) });

export type BojRuntimeSources = {
  readonly boj?: BojPageReader;
  readonly solvedAc?: Omit<SolvedAcCollectorOptions, "credentials">;
};

export async function hasBojIngestionSchema(
  pool: DatabasePool,
): Promise<boolean> {
  return pool.withSession(async (db) => {
    const table = await db.selectOne(
      checkMigrationTable,
      "SELECT 1 AS present FROM information_schema.TABLES WHERE TABLE_SCHEMA='jungol_bada' AND TABLE_NAME='migrations'",
      [],
      presentRow,
    );
    if (!table) return false;
    return new HealthRepository(db, true, true).hasRequiredMigration();
  });
}

function startLoop(
  nextDelay: () => number,
  operation: (signal: AbortSignal) => Promise<void>,
) {
  const stop = new AbortController();
  let running: Promise<void> = Promise.resolve();
  let scheduled: ReturnType<typeof setTimeout>;
  function schedule(): void {
    scheduled = setTimeout(() => {
      if (stop.signal.aborted) return;
      running = operation(stop.signal)
        .catch(() => undefined)
        .finally(() => {
          if (!stop.signal.aborted) schedule();
        });
    }, nextDelay());
    scheduled.unref();
  }
  schedule();
  return async () => {
    stop.abort();
    clearTimeout(scheduled);
    await running;
  };
}

export function createBojRuntime(
  database: InitializedDatabase,
  credentials?: SolvedAcCredentials,
  sources: BojRuntimeSources = {},
  reporter?: InternalIncidentReporter,
) {
  const incidents = new BojIncidents(reporter);
  const ranking = new BojRankingProjection(database.pool);
  const notifications = new BojRankingNotifications(database.pool);
  const solvedAc = new SolvedAcCollector(database, {
    ...sources.solvedAc,
    credentials,
  });
  const runner = new BojCycleRunner(
    database,
    sources.boj ?? new BojPageReader(),
    {
      solvedAc,
      onMemberFailure: (error) => incidents.failure("boj.member_failed", error),
      async projectRanking(now, signal) {
        const entries = await ranking.rebuild(now);
        if (entries) await notifications.send(entries, signal);
      },
    },
  );
  async function collect(signal: AbortSignal) {
    try {
      return await runner.run(signal);
    } catch (error) {
      if (!signal.aborted) await incidents.failure("boj.cycle_failed", error);
      throw error;
    }
  }

  async function refresh(signal: AbortSignal): Promise<void> {
    try {
      const result = await solvedAc.refreshOne(signal);
      if (result === "blocked" && !signal.aborted)
        await incidents.accessBlocked();
    } catch (error) {
      if (!signal.aborted)
        await incidents.failure("boj.solved_ac_refresh_failed", error);
      throw error;
    }
  }

  return {
    async runOnce(signal: AbortSignal) {
      const result = await collect(signal);
      if (result) await refresh(signal);
      return result;
    },
    start() {
      const stopCollection = startLoop(
        () => fiveMinutesMs - (Date.now() % fiveMinutesMs),
        async (signal) => {
          const result = await collect(signal);
          if (result) logger.info(result, "boj.cycle_complete");
        },
      );
      if (!credentials) logger.info("boj.solved_ac_credentials_missing");
      const stopSolvedAc = startLoop(() => 1_000, refresh);
      return async () => {
        await Promise.all([stopCollection(), stopSolvedAc()]);
      };
    },
  };
}
