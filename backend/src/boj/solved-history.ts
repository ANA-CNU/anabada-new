import { z } from "zod";
import {
  type DatabaseExecutor,
  type DatabasePool,
  defineSqlOperation,
} from "../infrastructure/mysql/database-session.js";
import {
  claimSolvedAcJob,
  finishSolvedAcRequest,
} from "./solved-ac-provider.js";
import type { HistoricalProblem, SolvedAcClient } from "./solved-ac.js";

const sql = {
  pending: defineSqlOperation("boj.pending_solved_history"),
  member: defineSqlOperation("boj.lock_solved_history_member"),
  advance: defineSqlOperation("boj.advance_solved_history"),
  delay: defineSqlOperation("boj.delay_solved_history"),
  seed: defineSqlOperation("boj.seed_historical_solve"),
  completeSummary: defineSqlOperation("boj.complete_historical_summary"),
};
const jobSchema = z.object({
  id: z.number().int().positive(),
  handle: z.string(),
  solved_handle: z.string().nullable(),
  next_page: z.number().int().nonnegative(),
});
type Job = z.infer<typeof jobSchema>;
type HistoryReader = Pick<SolvedAcClient, "profile" | "solvedPage">;

export class BojSolvedHistory {
  constructor(
    private readonly pool: DatabasePool,
    private readonly reader: HistoryReader,
  ) {}

  async refreshOne(
    signal: AbortSignal,
  ): Promise<"idle" | "processed" | "blocked"> {
    const job = await claimSolvedAcJob(this.pool, (db) =>
      db.selectOne(
        sql.pending,
        `SELECT id,handle,solved_ac_handle AS solved_handle,solved_ac_history_page AS next_page
         FROM user WHERE ignored=0 AND solved_ac_history_page IS NOT NULL
           AND solved_ac_history_next_at<=UTC_TIMESTAMP(3)
         ORDER BY solved_ac_history_next_at,id LIMIT 1`,
        [],
        jobSchema,
      ),
    );
    if (!job) return "idle";
    const result =
      job.next_page === 0 || job.solved_handle === null
        ? await this.reader.profile(
            job.handle,
            signal,
            job.solved_handle ?? job.handle,
          )
        : await this.reader.solvedPage(
            job.solved_handle,
            job.next_page,
            signal,
          );
    signal.throwIfAborted();
    const observedAt = new Date();
    await this.pool.unitOfWork(async (db) => {
      await finishSolvedAcRequest(db, result);
      if (result.kind === "retry" || result.kind === "missing") {
        await db.execute(
          sql.delay,
          "UPDATE user SET solved_ac_history_next_at=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE id=? AND solved_ac_history_page=?",
          [
            result.kind === "missing" ? 86_400 : result.delay,
            job.id,
            job.next_page,
          ],
        );
      } else if (result.kind === "resolved") {
        const user = await db.selectOne(
          sql.member,
          "SELECT tier FROM user WHERE id=? AND handle=? AND ignored=0 FOR UPDATE",
          [job.id, job.handle],
          z.object({ tier: z.number().int().min(0).max(31) }),
        );
        if (!user) return;
        if ("handle" in result.value) {
          await this.advance(db, job, 1, result.value);
        } else if (await this.advance(db, job, result.value.nextPage)) {
          await this.storePage(db, {
            userId: job.id,
            userTier: user.tier,
            problems: result.value.problems,
            observedAt,
          });
        }
        signal.throwIfAborted();
      }
    });
    return result.kind === "blocked" ? "blocked" : "processed";
  }

  private async advance(
    db: DatabaseExecutor,
    job: Job,
    page: number | null,
    profile?: { readonly handle: string; readonly tier: number },
  ) {
    const result = await db.execute(
      sql.advance,
      `UPDATE user SET solved_ac_handle=COALESCE(?,solved_ac_handle),tier=COALESCE(?,tier),
       solved_ac_history_page=?,solved_ac_history_next_at=IF(? IS NULL,NULL,TIMESTAMPADD(SECOND,30,UTC_TIMESTAMP(3)))
       WHERE id=? AND solved_ac_history_page=?`,
      [
        profile?.handle ?? null,
        profile?.tier ?? null,
        page,
        page,
        job.id,
        job.next_page,
      ],
    );
    return result.affectedRows === 1;
  }

  private async storePage(
    db: DatabaseExecutor,
    {
      userId,
      userTier,
      problems,
      observedAt,
    }: {
      userId: number;
      userTier: number;
      problems: readonly HistoricalProblem[];
      observedAt: Date;
    },
  ): Promise<void> {
    for (const { number, tier, title } of problems) {
      const level = tier - userTier;
      const inserted = await db.execute(
        sql.seed,
        "INSERT INTO problem (user_id,problem,problem_name,problem_tier,submitted_at,level,repeatation,solved_ac_observed_at) SELECT ?,?,?,?,'1970-01-01 00:00:01',?,0,? WHERE NOT EXISTS (SELECT 1 FROM problem WHERE user_id=? AND problem=?)",
        [userId, number, title, tier, level, observedAt, userId, number],
      );
      if (!inserted.affectedRows)
        await db.execute(
          sql.completeSummary,
          "UPDATE problem SET problem_name=COALESCE(problem_name,?),problem_tier=?,level=? WHERE user_id=? AND problem=? AND external_submission_id IS NULL AND submitted_at='1970-01-01 00:00:01' AND problem_tier IN (0,100)",
          [title, tier, level, userId, number],
        );
    }
  }
}
