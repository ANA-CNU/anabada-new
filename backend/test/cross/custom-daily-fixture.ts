import { expect } from "bun:test";
import { AccountInitializationService } from "../../../collector/src/account-initialization.js";
import { AccountSettlementService } from "../../../collector/src/account-settlement.js";
import { GroupRuntime } from "../../../collector/src/application/group-runtime.js";
import { CollectorConfigLoader } from "../../../collector/src/config.js";
import {
  problemIdSchema,
  submissionIdSchema,
} from "../../../collector/src/domain.js";
import { rankMemberSchema } from "../../../collector/src/domain/sync.js";
import { CollectorPoolFactory } from "../../../collector/src/mysql/pool.js";
import { AccountUnitOfWork } from "../../../collector/src/mysql/unit-of-work.js";
import { ProjectionService } from "../../../collector/src/projection.js";
import { KstCalendar } from "../../../collector/src/scoring/daily.js";
import { WeightedRankingPolicy } from "../../../collector/src/scoring/ranking.js";
import { createMysqlTestContext } from "../mysql/context.js";

export const now = new Date("2026-09-08T06:00:00Z");

export async function createScoreFlowFixture() {
  const context = await createMysqlTestContext();
  const config = new CollectorConfigLoader().parse({
    DB_PASSWORD: process.env.DB_PASSWORD,
    JUNGOL_USERNAME: "unused-fixture",
    JUNGOL_PASSWORD: "unused-fixture",
  });
  const collectorPool = new CollectorPoolFactory().create(
    config,
    config.credentials,
  );
  const close = async () => {
    try {
      await collectorPool.end();
    } finally {
      await context.close();
    }
  };
  try {
    await context.seed();
    await context.rawPool.query("DELETE FROM collector_ac_inbox");
    await context.rawPool.query("DELETE FROM collector_checkpoint");
    // API의 CURRENT_TIMESTAMP도 고정하여 같은 제출일 테스트가 실행 날짜에 의존하지 않게 한다.
    const timestampSql = `SET timestamp = ${now.getTime() / 1000}`;
    context.rawPool.on("connection", (connection) =>
      connection.query(timestampSql),
    );
    await context.rawPool.query(timestampSql);
    await context.rawPool.query(
      "UPDATE user SET initialized_at='2026-09-01',initial_submission_id=1002 WHERE id=2",
    );
    await context.rawPool.query(
      "INSERT INTO collector_checkpoint (group_id,committed_cursor,phase) VALUES (1125,1002,'idle')",
    );
    await context.rawPool.query(
      "INSERT INTO event_problem (event_id,problem,added_at) VALUES (201,3000,'2026-09-01')",
    );
    const member = rankMemberSchema.parse({
      accountId: "9002",
      jungolName: "beta",
      solvedCount: 2,
      wrongCount: 0,
      acRating: 418,
      tier: 8,
    });
    const calendar = new KstCalendar();
    const unitOfWork = new AccountUnitOfWork(collectorPool, calendar);
    const projection = new ProjectionService(
      collectorPool,
      calendar,
      new WeightedRankingPolicy(),
      "cross-score",
    );
    const settle = (submissionId = 7001, problemId = 3000) =>
      new GroupRuntime({
        groupId: "1125",
        accountUnitOfWork: unitOfWork,
        initialization: new AccountInitializationService(unitOfWork),
        settlement: new AccountSettlementService(unitOfWork, "1125", calendar),
        calendar,
        now: () => now,
        members: async () => [member],
        feed: {
          head: async () => BigInt(submissionId),
          readPage: async () => ({
            submissions: [
              {
                accountId: member.accountId,
                submissionId: submissionIdSchema.parse(submissionId),
                problemId: problemIdSchema.parse(problemId),
                submittedAt: new Date("2026-09-08T05:00:00Z"),
                score: 100,
              },
            ],
            nextCursor: null,
            more: false,
          }),
        },
        profiles: {
          initialize: async () => {
            throw new Error("existing member must not initialize");
          },
          currentMember: async () => member,
        },
        metadata: {
          read: async (id) => ({ problemId: id, title: "fixture", tier: 7 }),
        },
        project: async () => {
          throw new Error("atomic projection required");
        },
        projectOnConnection: (connection, date) =>
          projection.rebuildOnConnection(connection, date),
      }).runAtomic(new AbortController().signal);
    const request = (method: string, path: string, body?: unknown) =>
      context.handle(
        new Request(`http://test${path}`, {
          method,
          headers: { "content-type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    return {
      ...context,
      close,
      settle,
      request,
      custom: async (bias: number) => {
        const response = await request("POST", "/api/score-history/bulk", {
          records: [
            {
              user_id: 2,
              bias,
              desc: "cross custom",
              event_id: null,
              problem_id: null,
            },
          ],
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          insertedCount: 1,
          failed: [],
        });
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
