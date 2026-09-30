import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { TestContext } from "node:test";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { pino } from "pino";
import { HookRepository } from "../src/mysql/hooks.js";
import { RankingBoardWebhookRepository } from "../src/mysql/ranking-board-webhook.js";
import { RankingBoardWebhookService } from "../src/ranking-board-webhook-service.js";
import {
  DiscordWebhookClient,
  WebhookBroadcaster,
  WebhookMessageFormatter,
} from "../src/webhook.js";

export async function runRankingWebhookMysqlCases(
  t: TestContext,
  pool: Pool,
): Promise<void> {
  await t.test(
    "latest inactive board sends persisted top ten with its KST monthly BIA cache",
    async (testContext) => {
      const received: { readonly url: string; readonly payload: unknown }[] =
        [];
      const server = createServer((request, response) => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => {
          body += chunk;
        });
        request.on("end", () => {
          received.push({ url: request.url ?? "", payload: JSON.parse(body) });
          response.writeHead(204).end();
        });
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      testContext.after(
        () => new Promise<void>((resolve) => server.close(() => resolve())),
      );
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const prefix = `http://127.0.0.1:${address.port}/ranking-webhook-`;
      await pool.query(
        "DELETE FROM ranked_users WHERE user_id BETWEEN 9801 AND 9811",
      );
      await pool.query(
        "DELETE FROM user_bias_total WHERE user_id BETWEEN 9801 AND 9811",
      );
      await pool.query("DELETE FROM user WHERE id BETWEEN 9801 AND 9811");
      await pool.query(
        "DELETE FROM ranking_boards WHERE title IN ('webhook-old','webhook-latest')",
      );
      await pool.query("DELETE FROM hook");
      await pool.query(
        "INSERT INTO user (id,jungol_name,korean_name,jungol_account_id,ignored) VALUES ?",
        [
          Array.from({ length: 11 }, (_, index) => [
            9801 + index,
            `rank-${index + 1}`,
            index === 0 ? "첫째" : index === 1 ? null : `이름${index + 1}`,
            9801 + index,
            0,
          ]),
        ],
      );
      const [oldBoard] = await pool.execute<
        { insertId: number } & import("mysql2/promise").ResultSetHeader
      >(
        "INSERT INTO ranking_boards (title,created_at,is_active) VALUES ('webhook-old','2026-09-30 14:59:00',1)",
      );
      await pool.query(
        "INSERT INTO ranked_users (board_id,`rank`,user_id) VALUES (?,?,?)",
        [oldBoard.insertId, 1, 9801],
      );
      const [latestBoard] = await pool.execute<
        { insertId: number } & import("mysql2/promise").ResultSetHeader
      >(
        "INSERT INTO ranking_boards (title,created_at,is_active) VALUES ('webhook-latest','2026-09-30 15:01:00',0)",
      );
      await pool.query(
        "INSERT INTO ranked_users (board_id,`rank`,user_id) VALUES ?",
        [
          Array.from({ length: 11 }, (_, index) => [
            latestBoard.insertId,
            11 - index,
            9811 - index,
          ]),
        ],
      );
      await pool.query(
        "INSERT INTO user_bias_total (user_id,score_month,total_point) VALUES ?",
        [
          [
            ...Array.from({ length: 9 }, (_, index) => [
              9801 + index,
              "2026-10-01",
              100 - index,
            ]),
            [9810, "2026-09-01", 999],
          ],
        ],
      );
      const [wrongMonthRows] = await pool.query<
        (RowDataPacket & { readonly total_point: string })[]
      >(
        "SELECT CAST(total_point AS CHAR) AS total_point FROM user_bias_total WHERE user_id=9810 AND score_month='2026-09-01'",
      );
      assert.deepEqual(wrongMonthRows, [{ total_point: "999" }]);
      await pool.query("INSERT INTO hook (url,ignored) VALUES (?,0),(?,1)", [
        `${prefix}active`,
        `${prefix}ignored`,
      ]);
      await new RankingBoardWebhookService(
        new RankingBoardWebhookRepository(pool),
        new WebhookBroadcaster(
          new HookRepository(pool),
          new DiscordWebhookClient(1_000, 65_536, "content_and_text"),
          new WebhookMessageFormatter(),
          pino({ enabled: false }),
        ),
      ).notifyLatest(new AbortController().signal);
      assert.equal(received.length, 1);
      assert.equal(received[0]?.url, "/ranking-webhook-active");
      assert.deepEqual(received[0]?.payload, {
        content: [
          "추첨 결과가 바뀌었습니다.",
          "https://bada.anacnu.kr 에서 자세히 확인하세요!",
          "",
          "1. `rank-1(첫째)`: 100 BIA",
          "2. `rank-2`: 99 BIA",
          "3. `rank-3(이름3)`: 98 BIA",
          "4. `rank-4(이름4)`: 97 BIA",
          "5. `rank-5(이름5)`: 96 BIA",
          "6. `rank-6(이름6)`: 95 BIA",
          "7. `rank-7(이름7)`: 94 BIA",
          "8. `rank-8(이름8)`: 93 BIA",
          "9. `rank-9(이름9)`: 92 BIA",
          "10. `rank-10(이름10)`: 0 BIA",
        ].join("\n"),
        text: [
          "추첨 결과가 바뀌었습니다.",
          "https://bada.anacnu.kr 에서 자세히 확인하세요!",
          "",
          "1. `rank-1(첫째)`: 100 BIA",
          "2. `rank-2`: 99 BIA",
          "3. `rank-3(이름3)`: 98 BIA",
          "4. `rank-4(이름4)`: 97 BIA",
          "5. `rank-5(이름5)`: 96 BIA",
          "6. `rank-6(이름6)`: 95 BIA",
          "7. `rank-7(이름7)`: 94 BIA",
          "8. `rank-8(이름8)`: 93 BIA",
          "9. `rank-9(이름9)`: 92 BIA",
          "10. `rank-10(이름10)`: 0 BIA",
        ].join("\n"),
        allowed_mentions: { parse: [] },
      });
    },
  );
}
