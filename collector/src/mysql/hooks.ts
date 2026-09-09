import type { Pool, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

interface HookRow extends RowDataPacket {
  readonly id: number;
  readonly url: string;
}

const hookRowsSchema = z
  .array(
    z
      .object({
        id: z.number().int().positive(),
        url: z.string().min(1),
      })
      .readonly(),
  )
  .readonly();

export type HookEndpoint = z.infer<typeof hookRowsSchema>[number];

/** 활성 webhook 조회와 영구적으로 실패한 endpoint 비활성화만 담당한다. */
export class HookRepository {
  constructor(private readonly pool: Pool) {}

  async readActive(): Promise<readonly HookEndpoint[]> {
    const [rows] = await this.pool.query<HookRow[]>(
      "SELECT id,url FROM hook WHERE ignored=0 ORDER BY id ASC",
    );
    return hookRowsSchema.parse(rows);
  }

  async ignore(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.pool.query("UPDATE hook SET ignored=1 WHERE id IN (?)", [ids]);
  }
}
