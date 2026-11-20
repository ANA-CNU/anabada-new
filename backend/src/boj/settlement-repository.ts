import { z } from "zod";
import type { ScoreAward } from "../../../shared/automatic-scoring.js";
import type { DatabaseExecutor } from "../infrastructure/mysql/database-session.js";
import { defineSqlOperation } from "../infrastructure/mysql/database-session.js";
import {
  type MemberSettlement,
  bojSubmissionCursor,
  bojSubmissionId,
} from "./member-sync.js";

const sql = {
  member: defineSqlOperation("boj.member"),
  members: defineSqlOperation("boj.members"),
  lockMember: defineSqlOperation("boj.lock_member"),
  complete: defineSqlOperation("boj.complete_member"),
  register: defineSqlOperation("boj.register_member"),
  baselineAdvance: defineSqlOperation("boj.advance_baseline"),
  baselineRetry: defineSqlOperation("boj.retry_baseline"),
  baseline: defineSqlOperation("boj.insert_baseline", 10_000),
  confirmBaseline: defineSqlOperation("boj.confirm_baseline_solve"),
  solves: defineSqlOperation("boj.solved_counts"),
  duplicate: defineSqlOperation("boj.existing_attempt"),
  attempt: defineSqlOperation("boj.insert_attempt"),
  promote: defineSqlOperation("boj.promote_solved_observation"),
  daily: defineSqlOperation("boj.daily_days"),
  events: defineSqlOperation("boj.event_problems"),
  award: defineSqlOperation("boj.insert_award"),
} as const;
const positive = z.coerce.number().int().positive();
const counter = z.coerce.number().int().nonnegative();
const flag = z.union([z.literal(0), z.literal(1)]).transform(Boolean);
const memberSchema = z.object({
  id: positive,
  handle: z.string(),
  solution: bojSubmissionCursor,
  baseline: bojSubmissionCursor,
  corrects: counter,
  submissions: counter,
  solvedHandle: z.string().nullable(),
  retry: flag,
  baselineReady: flag,
  baselineTop: bojSubmissionId.nullable(),
  lastCheckedAt: z.date().nullable(),
});
const memberColumns =
  "id, handle, CAST(solution AS CHAR) AS solution, CAST(initial_submission_id AS CHAR) AS baseline, corrects, submissions, solved_ac_handle AS solvedHandle, retry_required AS retry, last_checked_at AS lastCheckedAt, baseline_ready AS baselineReady, CAST(baseline_top AS CHAR) AS baselineTop";
export type StoredMember = Readonly<z.output<typeof memberSchema>>;

export class BojSettlementConflict extends Error {
  readonly name = "BojSettlementConflict";
  constructor(
    readonly reason:
      | "cursor_changed"
      | "submission_owner_changed"
      | "invalid_attempt",
  ) {
    super(reason);
  }
}

export class BojSettlementRepository {
  constructor(private readonly db: DatabaseExecutor) {}

  member(handle: string, lock = false) {
    return this.db.selectOne(
      lock ? sql.lockMember : sql.member,
      `SELECT ${memberColumns} FROM user WHERE handle=?${lock ? " FOR UPDATE" : ""}`,
      [handle],
      memberSchema,
    );
  }

  members(handles: readonly string[]) {
    if (handles.length === 0) return Promise.resolve([]);
    return this.db.select(
      sql.members,
      `SELECT ${memberColumns} FROM user WHERE handle IN (?)`,
      [handles],
      memberSchema,
    );
  }

  async initialize(input: {
    readonly member: MemberSettlement["member"];
    readonly previous: StoredMember | undefined;
    readonly head: MemberSettlement["committedThrough"];
    readonly nextTop: StoredMember["baselineTop"];
    readonly solved: readonly number[];
    readonly checkedAt: Date;
    readonly solvedHandle?: string;
  }): Promise<void> {
    const { member, previous, head, nextTop, solved, checkedAt } = input;
    const existing = await this.member(member.handle, true);
    if (
      existing?.baselineReady ||
      existing?.id !== previous?.id ||
      existing?.baselineTop !== previous?.baselineTop
    )
      throw new BojSettlementConflict("cursor_changed");
    const userId =
      existing?.id ?? (await this.register(member, head, input.solvedHandle));
    for (const problem of new Set(solved)) {
      const inserted = await this.db.execute(
        sql.baseline,
        "INSERT INTO problem (user_id,problem,problem_tier,submitted_at,level,repeatation) SELECT ?,?,0,'1970-01-01 00:00:01',0,0 WHERE NOT EXISTS (SELECT 1 FROM problem WHERE user_id=? AND problem=?)",
        [userId, problem, userId, problem],
      );
      if (!inserted.affectedRows)
        await this.db.execute(
          sql.confirmBaseline,
          "UPDATE problem SET solved_ac_observed_at=NULL WHERE user_id=? AND problem=? AND solved_ac_observed_at IS NOT NULL",
          [userId, problem],
        );
    }
    await this.db.execute(
      sql.baselineAdvance,
      "UPDATE user SET baseline_top=?,baseline_ready=?,solution=?,initial_submission_id=?,last_checked_at=? WHERE id=?",
      [
        nextTop,
        nextTop === null,
        nextTop === null ? head : "0",
        head,
        checkedAt,
        userId,
      ],
    );
  }

  async deferEmptyBaseline(
    member: MemberSettlement["member"],
    checkedAt: Date,
    solvedHandle?: string,
  ): Promise<void> {
    const existing = await this.member(member.handle, true);
    if (existing?.baselineReady || existing?.baselineTop) return;
    const userId =
      existing?.id ?? (await this.register(member, "0", solvedHandle));
    await this.db.execute(
      sql.baselineRetry,
      "UPDATE user SET last_checked_at=? WHERE id=?",
      [checkedAt, userId],
    );
  }

  private async register(
    member: MemberSettlement["member"],
    head: MemberSettlement["committedThrough"],
    solvedHandle?: string,
  ): Promise<number> {
    const { insertId } = await this.db.execute(
      sql.register,
      "INSERT INTO user (handle,corrects,submissions,initial_submission_id,baseline_ready,solved_ac_handle,solved_ac_history_page,solved_ac_history_next_at) VALUES (?,?,?,?,0,?,0,UTC_TIMESTAMP(3))",
      [
        member.handle,
        member.solvedCount,
        member.submissionCount,
        head,
        solvedHandle ?? null,
      ],
    );
    return insertId;
  }

  async complete(
    user: StoredMember,
    result: MemberSettlement,
    profile: { readonly tier: number; readonly handle: string } | undefined,
    checkedAt: Date,
    solvedCountDelta: number,
  ) {
    return this.db.execute(
      sql.complete,
      "UPDATE user SET corrects=?,submissions=?,solution=?,retry_required=?,last_checked_at=?,tier=COALESCE(?,tier),solved_ac_handle=COALESCE(?,solved_ac_handle),solved_count_delta=IF(?,solved_count_delta,?) WHERE id=?",
      [
        result.member.solvedCount,
        result.member.submissionCount,
        result.committedThrough,
        result.retryRequired,
        checkedAt,
        profile?.tier ?? null,
        profile?.handle ?? null,
        result.retryRequired,
        solvedCountDelta,
        user.id,
      ],
    );
  }

  async solvedCounts(userId: number) {
    const rows = await this.db.select(
      sql.solves,
      `SELECT problem, COUNT(IF(solved_ac_observed_at IS NULL,1,NULL)) AS total,
        MIN(IF(solved_ac_observed_at IS NOT NULL,id,NULL)) AS observationId,
        MIN(solved_ac_observed_at) AS observedAt
        FROM problem WHERE user_id=? AND verdict='accepted' GROUP BY problem`,
      [userId],
      z.object({
        problem: positive,
        total: counter,
        observationId: positive.nullable(),
        observedAt: z.date().nullable(),
      }),
    );
    return new Map(
      rows.map(({ problem, total, observationId, observedAt }) => [
        problem,
        { total, observationId, observedAt },
      ]),
    );
  }

  async alreadySaved(
    userId: number,
    attempt: MemberSettlement["accepted"][number],
  ) {
    const row = await this.db.selectOne(
      sql.duplicate,
      "SELECT user_id, problem FROM problem WHERE external_submission_id=?",
      [attempt.id],
      z.object({ user_id: positive, problem: positive }),
    );
    if (
      row &&
      (row.user_id !== userId || row.problem !== attempt.problemNumber)
    )
      throw new BojSettlementConflict("submission_owner_changed");
    return row !== undefined;
  }

  async save(
    userId: number,
    attempt: MemberSettlement["accepted"][number],
    metadata: { readonly tier: number; readonly title: string | null },
    repetition: number,
    userTier: number,
    observationId: number | null,
  ): Promise<number> {
    if (observationId !== null) {
      const updated = await this.db.execute(
        sql.promote,
        "UPDATE problem SET problem_name=COALESCE(?,problem_name),problem_tier=?,submitted_at=?,level=?,repeatation=?,external_submission_id=?,solved_ac_observed_at=NULL WHERE id=? AND user_id=? AND problem=? AND solved_ac_observed_at IS NOT NULL",
        [
          metadata.title,
          metadata.tier,
          attempt.submittedAt,
          metadata.tier - userTier,
          repetition,
          attempt.id,
          observationId,
          userId,
          attempt.problemNumber,
        ],
      );
      if (updated.affectedRows !== 1)
        throw new BojSettlementConflict("invalid_attempt");
      return observationId;
    }
    const result = await this.db.execute(
      sql.attempt,
      "INSERT INTO problem (user_id,problem,problem_name,problem_tier,submitted_at,level,repeatation,external_submission_id) VALUES (?,?,?,?,?,?,?,?)",
      [
        userId,
        attempt.problemNumber,
        metadata.title,
        metadata.tier,
        attempt.submittedAt,
        metadata.tier - userTier,
        repetition,
        attempt.id,
      ],
    );
    if (result.insertId <= 0)
      throw new BojSettlementConflict("invalid_attempt");
    return result.insertId;
  }

  async awardedDays(userId: number): Promise<Set<string>> {
    const rows = await this.db.select(
      sql.daily,
      "SELECT DISTINCT DATE_FORMAT(score_day,'%Y-%m-%d') AS day FROM score_history WHERE user_id=? AND rule_type='daily'",
      [userId],
      z.object({ day: z.string() }),
    );
    return new Set(rows.map(({ day }) => day));
  }

  events(problemNumbers: readonly number[]) {
    if (problemNumbers.length === 0) return Promise.resolve([]);
    return this.db.select(
      sql.events,
      "SELECT e.id AS eventId, ep.problem AS problemNumber, e.begin, e.end, e.created_at AS createdAt, ep.added_at AS addedAt FROM event e JOIN event_problem ep ON ep.event_id=e.id WHERE ep.problem IN (?)",
      [problemNumbers],
      z.object({
        eventId: positive,
        problemNumber: positive,
        begin: z.date(),
        end: z.date(),
        createdAt: z.date(),
        addedAt: z.date(),
      }),
    );
  }

  async award(award: ScoreAward): Promise<void> {
    await this.db.execute(
      sql.award,
      "INSERT INTO score_history (user_id,problem_id,rule_type,award_key,score_day,event_id,bias,`desc`,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE award_key=award_key",
      [
        award.userId,
        award.problemRowId,
        award.ruleType,
        award.awardKey,
        award.scoreDay,
        award.eventId,
        award.bias,
        award.description,
        award.createdAt,
      ],
    );
  }
}
