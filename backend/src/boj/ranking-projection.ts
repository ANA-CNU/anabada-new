import { z } from "zod";
import { KstCalendar } from "../../../shared/automatic-scoring.js";
import { WeightedRankingPolicy } from "../../../shared/weighted-ranking.js";
import {
  type DatabasePool,
  defineSqlOperation,
} from "../infrastructure/mysql/database-session.js";

const operations = {
  scores: defineSqlOperation("boj.ranking_scores"),
  latest: defineSqlOperation("boj.ranking_latest"),
  members: defineSqlOperation("boj.ranking_members"),
  addBoard: defineSqlOperation("boj.add_ranking_board"),
  addMembers: defineSqlOperation("boj.add_ranking_members"),
};
const userId = z.number().int().positive();
const scoreRow = z.object({
  userId,
  handle: z.string(),
  koreanName: z.string().nullable(),
  score: z.number().int().positive(),
});
const boardRow = z.object({
  id: userId,
  title: z.string().nullable(),
});
type RankingEntry = z.infer<typeof scoreRow>;

export class BojRankingProjection {
  private readonly calendar = new KstCalendar();
  private readonly policy = new WeightedRankingPolicy();

  constructor(private readonly database: DatabasePool) {}

  async rebuild(now: Date): Promise<readonly RankingEntry[] | null> {
    const day = this.calendar.day(now);
    const monthKey = `${day.slice(0, 7)}-01`;
    const year = Number(day.slice(0, 4));
    const month = Number(day.slice(5, 7));
    const title = `${year}년 ${month}월 랭킹`;
    return this.database.unitOfWork(async (db) => {
      const scores = await db.select(
        operations.scores,
        "SELECT u.id AS userId, u.handle, u.korean_name AS koreanName, b.total_point AS score FROM user u JOIN user_bias_total b ON b.user_id=u.id AND b.score_month=? WHERE u.ignored=0 AND b.total_point>0 ORDER BY u.id",
        [monthKey],
        scoreRow,
      );
      if (scores.length === 0) return null;
      const total = scores.reduce((sum, entry) => sum + entry.score, 0);
      const ranked = this.policy.rank(
        scores,
        `anabada-${year * 100 + month}-${total}`,
      );
      const latest = await db.selectOne(
        operations.latest,
        "SELECT id,title FROM ranking_boards ORDER BY id DESC LIMIT 1",
        [],
        boardRow,
      );
      if (latest?.title === title) {
        const previous = await db.select(
          operations.members,
          "SELECT user_id FROM ranked_users WHERE board_id=? ORDER BY `rank`",
          [latest.id],
          z.object({ user_id: userId }),
        );
        if (
          previous.length === ranked.length &&
          previous.every((member, index) => member.user_id === ranked[index])
        )
          return null;
      }
      const board = await db.execute(
        operations.addBoard,
        "INSERT INTO ranking_boards (title,is_active,created_at) VALUES (?,0,?)",
        [title, now],
      );
      await db.execute(
        operations.addMembers,
        `INSERT INTO ranked_users (board_id,\`rank\`,user_id) VALUES ${ranked.map(() => "(?,?,?)").join(",")}`,
        ranked.flatMap((id, index) => [board.insertId, index + 1, id]),
      );
      const byId = new Map(scores.map((entry) => [entry.userId, entry]));
      return ranked.map((id) => {
        const entry = byId.get(id);
        if (!entry) throw new Error("Ranking entry is missing");
        return entry;
      });
    });
  }
}
