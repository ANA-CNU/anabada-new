import type { Pool, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

interface RankingBoardWebhookRow extends RowDataPacket {
  readonly rank: number;
  readonly jungolName: string;
  readonly koreanName: string | null;
  readonly bia: number | string;
}

const rankingBoardWebhookRowsSchema = z
  .array(
    z.object({
      rank: z.number().int().positive(),
      jungolName: z.string().min(1).max(50),
      koreanName: z.string().max(25).nullable(),
      bia: z.coerce.number().int(),
    }),
  )
  .max(10)
  .readonly();

export type RankingBoardWebhookEntry = z.infer<
  typeof rankingBoardWebhookRowsSchema
>[number];

export class RankingBoardWebhookRepository {
  constructor(private readonly pool: Pool) {}

  async readLatest(): Promise<readonly RankingBoardWebhookEntry[]> {
    // UTC timestamp 보드는 KST 월 캐시와 조인한다.
    const [rows] = await this.pool.query<RankingBoardWebhookRow[]>(
      "WITH latest_board AS (SELECT id,DATE_FORMAT(DATE_ADD(created_at,INTERVAL 9 HOUR),'%Y-%m-01') AS score_month FROM ranking_boards ORDER BY id DESC LIMIT 1) SELECT ru.`rank` AS `rank`,u.jungol_name AS jungolName,u.korean_name AS koreanName,COALESCE(b.total_point,0) AS bia FROM latest_board board JOIN ranked_users ru ON ru.board_id=board.id JOIN user u ON u.id=ru.user_id LEFT JOIN user_bias_total b ON b.user_id=u.id AND b.score_month=board.score_month ORDER BY ru.`rank` ASC LIMIT 10",
    );
    return rankingBoardWebhookRowsSchema.parse(rows);
  }
}
