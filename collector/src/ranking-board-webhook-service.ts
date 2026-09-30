import type { RankingBoardWebhookEntry } from "./mysql/ranking-board-webhook.js";
import type { WebhookBroadcaster } from "./webhook.js";

/** commit 뒤에 최신 저장 보드만 읽으며 WEBHOOK_URL 긴급 알림 경로를 사용하지 않는다. */
export class RankingBoardWebhookService {
  constructor(
    private readonly rankingBoards: {
      readLatest(): Promise<readonly RankingBoardWebhookEntry[]>;
    },
    private readonly broadcaster: WebhookBroadcaster,
  ) {}

  async notifyLatest(signal: AbortSignal): Promise<void> {
    const entries = await this.rankingBoards.readLatest();
    if (entries.length === 0) return;
    await this.broadcaster.broadcast(entries, signal);
  }
}
