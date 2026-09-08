import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ProjectionService } from "../src/projection.js";
import { KstCalendar } from "../src/scoring/daily.js";
import { WeightedRankingPolicy } from "../src/scoring/ranking.js";

interface BoardRow extends RowDataPacket {
  readonly id: number;
  readonly title: string | null;
  readonly is_active: number;
}
interface MemberRow extends RowDataPacket {
  readonly user_id: number;
}

class StableRankingPolicy extends WeightedRankingPolicy {
  override rank(
    users: readonly { readonly userId: number }[],
  ): readonly number[] {
    return users.map((user) => user.userId);
  }
}

const activeBoards = async (pool: Pool): Promise<readonly number[]> => {
  const [rows] = await pool.query<BoardRow[]>(
    "SELECT id FROM ranking_boards WHERE is_active=1 ORDER BY id",
  );
  return rows.map((row) => row.id);
};
const members = async (
  pool: Pool,
  boardId: number,
): Promise<readonly number[]> => {
  const [rows] = await pool.query<MemberRow[]>(
    "SELECT user_id FROM ranked_users WHERE board_id=? ORDER BY `rank`",
    [boardId],
  );
  return rows.map((row) => row.user_id);
};

export async function runManualProjectionCases(
  t: TestContext,
  pool: Pool,
): Promise<void> {
  await t.test(
    "manual active board persists across projection outcomes",
    async () => {
      await pool.query("DELETE FROM ranked_users");
      await pool.query("DELETE FROM ranking_boards");
      await pool.query("DELETE FROM user");
      await pool.query(
        "INSERT INTO user (id,jungol_name,jungol_account_id) VALUES (901,'projection-a',901),(902,'projection-b',902)",
      );
      await pool.query(
        "INSERT INTO score_history (user_id,bias,created_at) VALUES (901,10,'2026-09-07'),(902,1,'2026-09-07')",
      );
      const projection = new ProjectionService(
        pool,
        new KstCalendar(),
        new StableRankingPolicy(),
        "projection-regression",
      );
      const first = await projection.rebuild(new Date("2026-09-07Z"));
      assert.equal(first.kind, "changed");
      assert.ok(first.boardId);
      await pool.execute("UPDATE ranking_boards SET is_active=1 WHERE id=?", [
        first.boardId,
      ]);
      assert.deepEqual(await activeBoards(pool), [first.boardId]);

      const unchanged = await projection.rebuild(new Date("2026-09-07Z"));
      assert.equal(unchanged.kind, "unchanged");
      assert.deepEqual(await activeBoards(pool), [first.boardId]);

      await pool.query(
        "INSERT INTO user (id,jungol_name,jungol_account_id) VALUES (903,'projection-c',903)",
      );
      await pool.query(
        "INSERT INTO score_history (user_id,bias,created_at) VALUES (903,2,'2026-09-07')",
      );
      const changed = await projection.rebuild(new Date("2026-09-07Z"));
      assert.equal(changed.kind, "changed");
      assert.notEqual(changed.boardId, first.boardId);
      assert.deepEqual(await activeBoards(pool), [first.boardId]);

      await pool.query("UPDATE user SET ignored=1");
      const empty = await projection.rebuild(new Date("2026-09-07Z"));
      assert.equal(empty.kind, "unchanged");
      assert.deepEqual(await activeBoards(pool), [first.boardId]);

      await pool.query("UPDATE user SET ignored=0");
      await pool.query(
        "INSERT INTO score_history (user_id,bias,created_at) VALUES (901,10,'2026-10-07'),(902,1,'2026-10-07'),(903,2,'2026-10-07')",
      );
      const nextMonth = await projection.rebuild(new Date("2026-10-07Z"));
      assert.equal(nextMonth.kind, "changed");
      const [nextRows] = await pool.query<BoardRow[]>(
        "SELECT id,title,is_active FROM ranking_boards WHERE id=?",
        [nextMonth.boardId],
      );
      assert.deepEqual(nextRows, [
        {
          id: nextMonth.boardId,
          title: "2026년 10월 랭킹",
          is_active: 0,
        },
      ]);
      assert.deepEqual(
        await members(pool, nextMonth.boardId ?? 0),
        await members(pool, changed.boardId ?? 0),
      );
      assert.deepEqual(await activeBoards(pool), [first.boardId]);
    },
  );
}
