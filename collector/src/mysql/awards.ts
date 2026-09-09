import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import type { ScoreAward } from "../domain/sync.js";
import type { KstCalendar } from "../scoring/daily.js";
import type { EventProblem } from "../scoring/events.js";
import { PersistenceError } from "./account-types.js";

interface EventRow extends RowDataPacket, EventProblem {}
interface DayRow extends RowDataPacket {
  readonly day: string;
}
interface AwardRow extends RowDataPacket {
  readonly userId: number;
  readonly problemId: number | null;
  readonly problemNumber: number | null;
  readonly eventId: number | null;
  readonly ruleType: string;
  readonly scoreDay: string | null;
}

/** event와 event_problem의 읽기만 담당하고 점수 지급 여부는 판단하지 않는다. */
export class EventRepository {
  constructor(private readonly connection: PoolConnection) {}

  async readForProblems(
    problemNumbers: readonly number[],
  ): Promise<readonly EventProblem[]> {
    if (problemNumbers.length === 0) return [];
    const [rows] = await this.connection.query<EventRow[]>(
      "SELECT e.id AS eventId, ep.problem AS problemNumber, e.begin, e.end, e.created_at AS createdAt, ep.added_at AS addedAt FROM event e JOIN event_problem ep ON ep.event_id=e.id WHERE ep.problem IN (?)",
      [problemNumbers],
    );
    return rows;
  }
}

/** 멱등 점수 원장의 조회와 INSERT만 담당한다. */
export class ScoreHistoryRepository {
  constructor(private readonly connection: PoolConnection) {}

  async readDailyDays(userId: number): Promise<Set<string>> {
    const [rows] = await this.connection.execute<DayRow[]>(
      "SELECT DISTINCT DATE_FORMAT(score_day,'%Y-%m-%d') AS day FROM score_history WHERE user_id=? AND rule_type='daily'",
      [userId],
    );
    return new Set(rows.map((row) => row.day));
  }

  async insert(award: ScoreAward): Promise<void> {
    const [result] = await this.connection.execute<ResultSetHeader>(
      "INSERT INTO score_history (user_id, problem_id, rule_type, award_key, score_day, event_id, bias, `desc`, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?) ON DUPLICATE KEY UPDATE id=id",
      [
        award.userId,
        award.problemRowId,
        award.ruleType,
        award.awardKey,
        award.scoreDay,
        award.eventId,
        award.ruleType,
        award.createdAt,
      ],
    );
    if (result.affectedRows === 1 && result.insertId > 0) return;
    const [rows] = await this.connection.execute<AwardRow[]>(
      "SELECT s.user_id AS userId, s.problem_id AS problemId, p.problem AS problemNumber, s.event_id AS eventId, s.rule_type AS ruleType, DATE_FORMAT(s.score_day,'%Y-%m-%d') AS scoreDay FROM score_history s LEFT JOIN problem p ON p.id=s.problem_id WHERE s.award_key=? FOR UPDATE",
      [award.awardKey],
    );
    const existing = rows[0];
    if (
      !existing ||
      existing.userId !== award.userId ||
      existing.eventId !== award.eventId ||
      existing.ruleType !== award.ruleType ||
      existing.scoreDay !== award.scoreDay ||
      (award.ruleType === "daily"
        ? existing.problemId !== award.problemRowId
        : existing.problemNumber !== award.problemNumber)
    )
      throw new PersistenceError("score_conflict");
  }
}

/** 월간 합계 캐시 갱신 SQL만 수행하며 원장 점수는 수정하지 않는다. */
export class BiasRepository {
  constructor(
    private readonly connection: PoolConnection,
    private readonly calendar: KstCalendar,
  ) {}

  async refreshUser(userId: number, now: Date): Promise<void> {
    const [start, end] = this.calendar.monthWindow(now);
    await this.connection.execute(
      "INSERT INTO user_bias_total (user_id, total_point) SELECT ?, COALESCE(SUM(bias),0) FROM score_history WHERE user_id=? AND created_at>=? AND created_at<? ON DUPLICATE KEY UPDATE total_point=VALUES(total_point)",
      [userId, userId, start, end],
    );
  }
}
