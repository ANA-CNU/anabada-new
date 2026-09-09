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

/** 원장과 분리된 짧은 transaction으로 월 합계와 내부 순위 snapshot만 재생성하며, is_active 발행 상태는 관리자가 전담한다. */
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
      const [start, end] = this.calendar.monthWindow(now);
      await connection.execute(
        "INSERT INTO user_bias_total (user_id,total_point) SELECT u.id,COALESCE(SUM(s.bias),0) FROM user u LEFT JOIN score_history s ON s.user_id=u.id AND s.created_at>=? AND s.created_at<? GROUP BY u.id ON DUPLICATE KEY UPDATE total_point=VALUES(total_point)",
        [start, end],
      );
      const [users] = await connection.query<ScoreRow[]>(
        "SELECT u.id AS userId, u.jungol_name AS jungolName, COALESCE(b.total_point,0) AS score FROM user u LEFT JOIN user_bias_total b ON b.user_id=u.id WHERE u.ignored=0 AND COALESCE(b.total_point,0)>0 ORDER BY u.id ASC",
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
