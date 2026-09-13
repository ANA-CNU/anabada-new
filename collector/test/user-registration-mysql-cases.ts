import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { rankMemberSchema } from "../src/domain/sync.js";
import { AccountUnitOfWork } from "../src/mysql/unit-of-work.js";
import { UserRepository } from "../src/mysql/users.js";
import { KstCalendar } from "../src/scoring/daily.js";

export async function runUserRegistrationCases(
  t: TestContext,
  pool: Pool,
): Promise<void> {
  const work = new AccountUnitOfWork(pool, new KstCalendar());
  for (const [index, mode] of ["upsert", "cycle"].entries()) {
    await t.test(
      `new ${mode} registration is ignored and preserves administrator opt-in on replay`,
      async () => {
        const member = rankMemberSchema.parse({
          accountId: String(990001 + index),
          jungolName: `ignored-test-${index}`,
          solvedCount: 0,
          wrongCount: 0,
          acRating: 0,
          tier: 0,
        });
        const register = () =>
          work.executeConnection(async (connection) => {
            const users = new UserRepository(connection);
            if (mode === "upsert") await users.upsertAndLock(member);
            else await users.lockRegisteredMembers([member]);
            await users.refreshMetadata(member);
          });
        await register();
        const [initial] = await pool.query<
          (RowDataPacket & { ignored: number })[]
        >("SELECT ignored FROM user WHERE jungol_account_id=?", [
          member.accountId,
        ]);
        assert.equal(initial[0]?.ignored, 1);
        await pool.execute(
          "UPDATE user SET ignored=0 WHERE jungol_account_id=?",
          [member.accountId],
        );
        await register();
        const [replayed] = await pool.query<
          (RowDataPacket & { ignored: number })[]
        >("SELECT ignored FROM user WHERE jungol_account_id=?", [
          member.accountId,
        ]);
        assert.equal(replayed[0]?.ignored, 0);
      },
    );
  }
}
