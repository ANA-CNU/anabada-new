import { BackendDiscordTransport } from "../emergency-webhook.js";
import type { DatabasePool } from "../infrastructure/mysql/database-session.js";
import { HookRepository } from "../infrastructure/mysql/repositories/hook-repository.js";
import { logger } from "../logger.js";
import type { BojRankingProjection } from "./ranking-projection.js";

type RankingEntries = NonNullable<
  Awaited<ReturnType<BojRankingProjection["rebuild"]>>
>;

export class BojRankingNotifications {
  constructor(
    private readonly database: DatabasePool,
    private readonly transport: Pick<
      BackendDiscordTransport,
      "send"
    > = new BackendDiscordTransport(true),
  ) {}

  async send(entries: RankingEntries, signal: AbortSignal): Promise<void> {
    const endpoints = await this.database.withSession((db) =>
      new HookRepository(db).listActive(),
    );
    const content = [
      "추첨 결과가 바뀌었습니다.",
      "https://bada.anacnu.kr 에서 자세히 확인하세요!",
      "",
      ...entries.slice(0, 10).map(({ handle, koreanName, score }, index) => {
        const name = koreanName?.trim();
        const display = name ? `${handle}(${name})` : handle;
        const safe = display.replace(/\s+/gu, " ").replaceAll("`", "ˋ");
        return `${index + 1}. \`${safe}\`: ${score} BIA`;
      }),
    ].join("\n");
    for (let offset = 0; offset < endpoints.length; offset += 10) {
      await Promise.all(
        endpoints.slice(offset, offset + 10).map(async ({ id, url }) => {
          signal.throwIfAborted();
          if (await this.transport.send(url, content, signal)) return;
          signal.throwIfAborted();
          logger.warn({ hookId: id }, "boj.ranking_hook_failed");
          await this.database.withSession((db) =>
            new HookRepository(db).disableFailed(id, url),
          );
        }),
      );
    }
  }
}
