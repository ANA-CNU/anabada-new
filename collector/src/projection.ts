import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { KstCalendar } from "./scoring/daily.js";
import type { RankingScore, WeightedRankingPolicy } from "./scoring/ranking.js";

interface ScoreRow extends RowDataPacket, RankingScore {
  readonly jungolName: string;
}
interface BoardRow extends RowDataPacket {
  readonly id: number;
  readonly title: string | null;
}
interface RankedRow extends RowDataPacket {
  readonly user_id: number;
}

export type ProjectedRankingEntry = {
  readonly userId: number;
  readonly jungolName: string;
  readonly score: number;
};

export type ProjectionResult =
  | { readonly kind: "unchanged"; readonly boardId: number | null }
  | {
      readonly kind: "changed";
      readonly boardId: number | null;
      readonly entries: readonly ProjectedRankingEntry[];
    };

/** 월간 캐시만 읽어 내부 순위 snapshot을 재생성하며, is_active 발행 상태는 관리자가 전담한다. */
export class ProjectionService {
  constructor(
    private readonly pool: Pool,
    private readonly calendar: KstCalendar,
    private readonly ranking: WeightedRankingPolicy,
    private readonly randomSeed: string,
  ) {}

  async rebuild(now = new Date()): Promise<ProjectionResult> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const scoreMonth = `${this.calendar.day(now).slice(0, 7)}-01`;
      const [users] = await connection.query<ScoreRow[]>(
        "SELECT u.id AS userId, u.jungol_name AS jungolName, COALESCE(b.total_point,0) AS score FROM user u LEFT JOIN user_bias_total b ON b.user_id=u.id AND b.score_month=? WHERE u.ignored=0 AND COALESCE(b.total_point,0)>0 ORDER BY u.id ASC",
        [scoreMonth],
      );
      const [latest] = await connection.query<BoardRow[]>(
        "SELECT id, title FROM ranking_boards ORDER BY id DESC LIMIT 1",
      );
      const previous = latest[0];
      if (users.length === 0) {
        await connection.commit();
        return { kind: "unchanged", boardId: previous?.id ?? null };
      }
      const day = this.calendar.day(now);
      const year = Number(day.slice(0, 4));
      const month = Number(day.slice(5, 7));
      const totalScore = users.reduce((total, user) => total + user.score, 0);
      const ranking = this.ranking.rank(
        users,
        `${this.randomSeed}-${year * 100 + month}-${totalScore}`,
      );
      const entries = ranking.map((userId): ProjectedRankingEntry => {
        const user = users.find((candidate) => candidate.userId === userId);
        if (!user) throw new RangeError("Projected user is missing");
        return {
          userId,
          jungolName: user.jungolName,
          score: user.score,
        };
      });
      const title = `${year}년 ${month}월 랭킹`;
      if (previous?.title === title) {
        const [members] = await connection.execute<RankedRow[]>(
          "SELECT user_id FROM ranked_users WHERE board_id=? ORDER BY `rank` ASC",
          [previous.id],
        );
        if (
          members.length === ranking.length &&
          members.every((member, index) => member.user_id === ranking[index])
        ) {
          await connection.commit();
          return { kind: "unchanged", boardId: previous.id };
        }
      }
      const [board] = await connection.execute<ResultSetHeader>(
        "INSERT INTO ranking_boards (title,is_active) VALUES (?,0)",
        [title],
      );
      await connection.query(
        "INSERT INTO ranked_users (board_id,`rank`,user_id) VALUES ?",
        [ranking.map((userId, index) => [board.insertId, index + 1, userId])],
      );
      await connection.commit();
      return { kind: "changed", boardId: board.insertId, entries };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
