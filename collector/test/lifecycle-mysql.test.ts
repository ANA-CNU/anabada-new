import assert from "node:assert/strict";
import test from "node:test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { AccountInitializationService } from "../src/account-initialization.js";
import { AccountSyncService } from "../src/account-sync.js";
import type { CycleAdapters } from "../src/application/cycle-types.js";
import { SyncCycleExecutor } from "../src/application/execute-cycle.js";
import {
  InitialSubmissionCursor,
  rankMemberSchema,
} from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";
import { JungolError } from "../src/jungol/errors.js";
import { CycleLeaseManager } from "../src/mysql/lease.js";
import { AccountUnitOfWork } from "../src/mysql/unit-of-work.js";
import { UserRepository } from "../src/mysql/users.js";
import { ProjectionService } from "../src/projection.js";
import { KstCalendar } from "../src/scoring/daily.js";
import { WeightedRankingPolicy } from "../src/scoring/ranking.js";

interface State extends RowDataPacket {
  readonly corrects: number;
  readonly solution: string;
  readonly attempts: string;
  readonly scores: string;
  readonly boards: string;
}
const { MYSQL_TEST_PORT: testPort } = process.env;
test(
  "real coordinator commits account and projects without a DB run ledger",
  { skip: !testPort },
  async () => {
    const port = z.coerce.number().int().positive().parse(testPort);
    const pool = createPool({
      host: "127.0.0.1",
      port,
      user: "root",
      database: "jungol_bada",
      timezone: "Z",
      supportBigNumbers: true,
      bigNumberStrings: true,
    });
    const connection = await pool.getConnection();
    const member = rankMemberSchema.parse({
      accountId: "81291",
      jungolName: "fixture",
      solvedCount: 1,
      wrongCount: 1,
      acRating: 0,
      tier: 0,
    });
    const calendar = new KstCalendar();
    const persistence = new AccountSyncService(
      new AccountUnitOfWork(pool, calendar),
      calendar,
    );
    const initialization = new AccountInitializationService(
      new AccountUnitOfWork(pool, calendar),
    );
    const leases = new CycleLeaseManager(pool);
    const projection = new ProjectionService(
      pool,
      calendar,
      new WeightedRankingPolicy(),
      "fixture",
    );
    const adapters: CycleAdapters = {
      lease: () => leases.acquire(),
      login: async () => {},
      rank: async () => [member],
      stored: async () =>
        new Map(
          (await new UserRepository(connection).readAll()).map((user) => [
            user.accountId,
            {
              solvedCount: user.solvedCount,
              lastSubmissionId: BigInt(user.cursor),
            },
          ]),
        ),
      browser: async () => ({
        summary: async () => [{ problemId: problemIdSchema.parse(81291) }],
        cursor: async () => new InitialSubmissionCursor(8129101n, 1),
        collect: async () => ({
          attempts: [
            {
              submissionId: submissionIdSchema.parse(8129100),
              problemId: problemIdSchema.parse(81291),
              verdict: "accepted",
              score: 100,
              submittedAt: new Date("2026-09-07T01:00:00Z"),
            },
          ],
          highestInspectedId: 8129101n,
          pageCount: 1,
          cursorReached: true,
        }),
        metadata: async (id) => ({
          problemId: id,
          title: `JUNGOL #${id}`,
          tier: 0,
        }),
        close: async () => {},
      }),
      persist: (input) => persistence.persist(input),
      initialize: (snapshot) => initialization.initialize(snapshot),
      refreshMetadata: async () => {},
      project: async () => {
        await projection.rebuild(new Date("2026-09-07T01:00:00Z"));
      },
    };
    try {
      const owner = await leases.acquire();
      assert.ok(owner);
      try {
        const overlap = await new SyncCycleExecutor(
          {
            ...adapters,
            login: async () => assert.fail("unexpected network login"),
            rank: async () => assert.fail("unexpected network rank"),
            browser: async () => assert.fail("unexpected browser"),
          },
          { concurrency: 1, maxPages: 10 },
        ).run(new AbortController().signal);
        assert.equal(overlap.status, "skipped_overlap");
      } finally {
        await owner.release();
      }
      for (const code of [
        "auth_required",
        "manual_recovery_required",
      ] as const) {
        const stopped = await new SyncCycleExecutor(
          {
            ...adapters,
            login: async () => {
              throw new JungolError(code);
            },
            rank: async () => assert.fail("unexpected rank after circuit"),
          },
          { concurrency: 1, maxPages: 10 },
        ).run(new AbortController().signal);
        assert.equal(stopped.status, code);
      }
      const result = await new SyncCycleExecutor(adapters, {
        concurrency: 1,
        maxPages: 10,
      }).run(new AbortController().signal);
      assert.equal(result.status, "success");
      const [rows] = await connection.query<State[]>(
        "SELECT corrects,solution,(SELECT COUNT(*) FROM problem) AS attempts,(SELECT COUNT(*) FROM score_history) AS scores,(SELECT COUNT(*) FROM ranking_boards) AS boards FROM user WHERE jungol_account_id='81291'",
      );
      assert.equal(rows[0]?.corrects, 1);
      assert.equal(rows[0]?.solution, "8129101");
      assert.equal(Number(rows[0]?.attempts), 1);
      assert.equal(Number(rows[0]?.scores), 0);
      assert.equal(Number(rows[0]?.boards), 0);
    } finally {
      connection.release();
      await pool.end();
    }
  },
);
