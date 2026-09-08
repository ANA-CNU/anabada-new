import { z } from "zod";
import type { DatabaseExecutor, SqlOperation } from "../database-session.js";
import { sqlOperations } from "../database-session.js";

const operation = (id: string): SqlOperation => {
  const found = Object.values(sqlOperations).find(
    (candidate) => candidate.id === id,
  );
  if (!found) throw new Error(`Missing SQL operation: ${id}`);
  return found;
};
const number = z.coerce.number().finite();
const count = z.coerce.number().int().nonnegative();
const utcDate = z.coerce.date().transform((value) => value.toISOString());
const name = z.object({
  display_name: z.string(),
  jungol_name: z.string(),
  korean_name: z.string().nullable(),
  tier: z.number().int(),
});
const solvedRow = name.extend({ solved: count });
const monthlySolvedRow = solvedRow.extend({ total_solved: count });
const biasRow = name.extend({ bias: number });
const boardRow = biasRow.extend({ rank: count });
const latestBiasRow = boardRow.extend({
  delta: z.coerce.number().int(),
  total_problem: count,
  monthly_problem: count,
});
const recentlyDateRow = z.object({ created_at: utcDate });
const gainersRow = name.extend({
  user_id: z.number().int().nonnegative(),
  rank: count,
  delta: z.coerce.number().int(),
});
const rankHistoryRow = z.object({
  board_id: z.number().int().nonnegative(),
  created_at: utcDate,
  rank: count,
});
const selectedMonthRow = name.extend({
  rank: count,
  last_month_solved: count,
  last_month_score: number,
});
const adminBoardRow = z.object({
  id: z.coerce.number().int().positive(),
  title: z.string().nullable(),
  created_at: utcDate,
  is_active: z.union([z.literal(0), z.literal(1)]).transform(Boolean),
  member_count: count,
});
const adminBoardCountRow = z.object({ total: count });
const adminBoardMemberRow = z.object({
  rank: z.coerce.number().int().positive(),
  user_id: z.coerce.number().int().positive(),
  jungol_name: z.string(),
  tier: z.coerce.number().int(),
});

export type AdminRankingBoard = Readonly<z.infer<typeof adminBoardRow>>;
export type AdminRankingBoardMember = Readonly<
  z.infer<typeof adminBoardMemberRow>
>;
const scoreRow = z.object({
  id: z.number().int().nonnegative(),
  display_name: z.string(),
  desc: z.string().nullable(),
  bias: number,
  event_id: z.number().int().nullable(),
  problem_id: z
    .union([
      z.string().regex(/^\d+$/),
      z.number().int().nonnegative().transform(String),
    ])
    .nullable(),
  created_at: utcDate,
});

export type RankingRepositoryFactory = Readonly<{
  withRepository<T>(
    work: (repository: RankingRepository) => Promise<T>,
  ): Promise<T>;
}>;

export class RankingRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  solvedThisMonth(start: Date, end: Date) {
    return this.database.select(
      operation("ranking.solved_month"),
      `SELECT u.jungol_name AS display_name, u.jungol_name, u.korean_name, u.tier, COUNT(p.id) AS solved FROM user u JOIN problem p ON p.user_id = u.id WHERE p.repeatation = 0 AND p.verdict = 'accepted' AND p.submitted_at >= ? AND p.submitted_at < ? GROUP BY u.id, u.jungol_name, u.korean_name, u.tier HAVING COUNT(p.id) > 0 ORDER BY solved DESC, u.jungol_name ASC`,
      [start, end],
      solvedRow,
    );
  }
  monthlySolved(start: Date, end: Date) {
    return this.database.select(
      operation("ranking.monthly_solved"),
      `SELECT u.jungol_name AS display_name, u.jungol_name, u.korean_name, u.tier, COUNT(p.id) AS solved, u.corrects AS total_solved FROM user u JOIN problem p ON p.user_id = u.id WHERE p.repeatation = 0 AND p.verdict = 'accepted' AND p.submitted_at >= ? AND p.submitted_at < ? GROUP BY u.id, u.jungol_name, u.korean_name, u.tier, u.corrects HAVING COUNT(p.id) > 0 ORDER BY solved DESC, u.jungol_name ASC`,
      [start, end],
      monthlySolvedRow,
    );
  }
  bias() {
    return this.database.select(
      operation("ranking.bias"),
      "SELECT u.jungol_name AS display_name, u.jungol_name, u.korean_name, u.tier, ub.total_point AS bias FROM user u JOIN user_bias_total ub ON ub.user_id = u.id WHERE ub.total_point > 0 ORDER BY ub.total_point DESC",
      [],
      biasRow,
    );
  }
  latestBias(start: Date, end: Date) {
    return this.database.select(
      operation("ranking.bias_v2"),
      `WITH latest_board AS (SELECT id FROM ranking_boards ORDER BY id DESC LIMIT 1), previous_board AS (SELECT id FROM ranking_boards WHERE id < (SELECT id FROM latest_board) ORDER BY id DESC LIMIT 1), monthly_problems AS (SELECT user_id, COUNT(*) AS monthly_problem FROM problem WHERE repeatation = 0 AND verdict = 'accepted' AND submitted_at >= ? AND submitted_at < ? GROUP BY user_id) SELECT u.jungol_name AS display_name, u.jungol_name, u.korean_name, u.tier, lr.rank, COALESCE(pr.rank - lr.rank, 0) AS delta, u.corrects AS total_problem, COALESCE(ubt.total_point, 0) AS bias, COALESCE(mp.monthly_problem, 0) AS monthly_problem FROM ranked_users lr JOIN latest_board lb ON lr.board_id = lb.id JOIN user u ON u.id = lr.user_id LEFT JOIN ranked_users pr ON pr.user_id = lr.user_id AND pr.board_id = (SELECT id FROM previous_board) LEFT JOIN user_bias_total ubt ON ubt.user_id = u.id LEFT JOIN monthly_problems mp ON mp.user_id = u.id ORDER BY lr.rank`,
      [start, end],
      latestBiasRow,
    );
  }
  latestBoard() {
    return this.database.select(
      operation("ranking.board_latest"),
      "SELECT u.jungol_name AS display_name, u.jungol_name, u.korean_name, u.tier, COALESCE(ub.total_point, 0) AS bias, ru.rank FROM ranked_users ru JOIN user u ON u.id = ru.user_id LEFT JOIN user_bias_total ub ON ub.user_id = u.id WHERE ru.board_id = (SELECT id FROM ranking_boards ORDER BY created_at DESC LIMIT 1) ORDER BY ru.rank",
      [],
      boardRow,
    );
  }
  latestBoardDate() {
    return this.database.selectOne(
      operation("ranking.board_latest_date"),
      "SELECT created_at FROM ranking_boards ORDER BY id DESC LIMIT 1",
      [],
      recentlyDateRow,
    );
  }
  topGainers(limit: number) {
    return this.database.select(
      operation("ranking.top_gainers"),
      "WITH boards AS (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS ordinal FROM ranking_boards) SELECT ru_latest.user_id, u.jungol_name AS display_name, u.jungol_name, u.korean_name, u.tier, ru_latest.rank, ru_previous.rank - ru_latest.rank AS delta FROM ranked_users ru_latest JOIN boards latest ON latest.id = ru_latest.board_id AND latest.ordinal = 1 JOIN boards previous ON previous.ordinal = 2 JOIN ranked_users ru_previous ON ru_previous.board_id = previous.id AND ru_previous.user_id = ru_latest.user_id JOIN user u ON u.id = ru_latest.user_id ORDER BY delta DESC LIMIT ?",
      [limit],
      gainersRow,
    );
  }
  rankHistory(userId: number, limit: number) {
    return this.database.select(
      operation("ranking.user_rank_history"),
      "SELECT recent.board_id, recent.created_at, recent.rank FROM (SELECT rb.id AS board_id, rb.created_at, ru.rank FROM ranked_users ru JOIN ranking_boards rb ON rb.id = ru.board_id WHERE ru.user_id = ? ORDER BY rb.created_at DESC LIMIT ?) recent ORDER BY recent.created_at ASC",
      [userId, limit],
      rankHistoryRow,
    );
  }
  selectedMonth(start: Date, end: Date, limit: number) {
    return this.database.select(
      operation("ranking.selected_month"),
      `SELECT u.jungol_name AS display_name, u.jungol_name, u.korean_name, u.tier, ru.rank, COALESCE(ps.solved, 0) AS last_month_solved, COALESCE(ss.score, 0) AS last_month_score FROM ranked_users ru JOIN (SELECT id FROM ranking_boards WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1) board ON board.id = ru.board_id JOIN user u ON u.id = ru.user_id LEFT JOIN (SELECT user_id, COUNT(*) AS solved FROM problem WHERE repeatation = 0 AND verdict = 'accepted' AND submitted_at >= ? AND submitted_at < ? GROUP BY user_id) ps ON ps.user_id = u.id LEFT JOIN (SELECT user_id, SUM(bias) AS score FROM score_history WHERE created_at >= ? AND created_at < ? GROUP BY user_id) ss ON ss.user_id = u.id ORDER BY ru.rank LIMIT ?`,
      [start, end, start, end, limit],
      selectedMonthRow,
    );
  }
  recentlyScore(limit: number, offset: number) {
    return this.database.select(
      operation("ranking.recent_score"),
      "SELECT sh.id, u.jungol_name AS display_name, sh.desc, sh.bias, sh.event_id, CAST(sh.problem_id AS CHAR) AS problem_id, sh.created_at FROM score_history sh JOIN user u ON u.id = sh.user_id WHERE u.ignored = 0 ORDER BY sh.created_at DESC LIMIT ? OFFSET ?",
      [limit, offset],
      scoreRow,
    );
  }
  recentScoreTop(limit: number) {
    return this.database.select(
      operation("ranking.recent_score_top"),
      "SELECT sh.id, u.jungol_name AS display_name, sh.desc, sh.bias, sh.event_id, CAST(sh.problem_id AS CHAR) AS problem_id, sh.created_at FROM score_history sh JOIN user u ON u.id = sh.user_id ORDER BY sh.created_at DESC LIMIT ?",
      [limit],
      scoreRow,
    );
  }
  scoreHistory(userId: number, limit: number) {
    return this.database.select(
      operation("ranking.user_score_history"),
      "SELECT sh.id, u.jungol_name AS display_name, sh.desc, sh.bias, sh.event_id, CAST(sh.problem_id AS CHAR) AS problem_id, sh.created_at FROM score_history sh JOIN user u ON u.id = sh.user_id WHERE sh.user_id = ? ORDER BY sh.created_at DESC LIMIT ?",
      [userId, limit],
      scoreRow,
    );
  }
  adminBoards(limit: number, offset: number) {
    return this.database.select(
      operation("admin.ranking_boards.list"),
      "SELECT rb.id, rb.title, rb.created_at, rb.is_active, COUNT(ru.id) AS member_count FROM ranking_boards rb LEFT JOIN ranked_users ru ON ru.board_id = rb.id GROUP BY rb.id, rb.title, rb.created_at, rb.is_active ORDER BY rb.id DESC LIMIT ? OFFSET ?",
      [limit, offset],
      adminBoardRow,
    );
  }
  async adminBoardCount(): Promise<number> {
    const row = await this.database.selectOne(
      operation("admin.ranking_boards.count"),
      "SELECT COUNT(*) AS total FROM ranking_boards",
      [],
      adminBoardCountRow,
    );
    return row?.total ?? 0;
  }
  adminBoard(id: number) {
    return this.database.selectOne(
      operation("admin.ranking_boards.find"),
      "SELECT rb.id, rb.title, rb.created_at, rb.is_active, COUNT(ru.id) AS member_count FROM ranking_boards rb LEFT JOIN ranked_users ru ON ru.board_id = rb.id WHERE rb.id = ? GROUP BY rb.id, rb.title, rb.created_at, rb.is_active",
      [id],
      adminBoardRow,
    );
  }
  adminBoardMembers(id: number) {
    return this.database.select(
      operation("admin.ranking_boards.members"),
      "SELECT ru.`rank`, u.id AS user_id, u.jungol_name, u.tier FROM ranked_users ru JOIN user u ON u.id = ru.user_id WHERE ru.board_id = ? ORDER BY ru.`rank` ASC",
      [id],
      adminBoardMemberRow,
    );
  }
  /** 관리자 선택 경합을 직렬화하기 위해 작은 보드 집합 전체를 항상 같은 순서로 잠근다. */
  lockAllAdminBoards() {
    return this.database.select(
      operation("admin.ranking_boards.lock"),
      "SELECT id FROM ranking_boards ORDER BY id ASC FOR UPDATE",
      [],
      z.object({ id: z.coerce.number().int().positive() }),
    );
  }
  deactivateAllAdminBoards() {
    return this.database.execute(
      operation("admin.ranking_boards.deactivate_all"),
      "UPDATE ranking_boards SET is_active = 0 WHERE is_active = 1",
      [],
    );
  }
  setAdminBoardActive(id: number, isActive: boolean) {
    return this.database.execute(
      operation("admin.ranking_boards.set_active"),
      "UPDATE ranking_boards SET is_active = ? WHERE id = ?",
      [isActive ? 1 : 0, id],
    );
  }
}
