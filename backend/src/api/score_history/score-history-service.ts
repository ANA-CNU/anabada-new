import type { DatabaseExecutor } from "../../infrastructure/mysql/database-session.js";
import { MonthlyScoreCacheRepository } from "../../infrastructure/mysql/repositories/monthly-score-cache.js";
import {
  type ManualScoreHistory,
  type ScoreHistoryPatch,
  ScoreHistoryRepository,
} from "../../infrastructure/mysql/repositories/score-history-repository.js";

export interface ScoreHistoryUnitOfWork {
  unitOfWork<T>(work: (database: DatabaseExecutor) => Promise<T>): Promise<T>;
}
export interface ScoreHistoryReader {
  withSession<T>(work: (database: DatabaseExecutor) => Promise<T>): Promise<T>;
}
export class ScoreHistoryService {
  constructor(
    private readonly reader: ScoreHistoryReader,
    private readonly transactions: ScoreHistoryUnitOfWork,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async bulk(records: readonly ManualScoreHistory[]) {
    return this.transactions.unitOfWork(async (database) => {
      const repository = new ScoreHistoryRepository(database);
      const cache = new MonthlyScoreCacheRepository(database);
      const failed: Array<{ user_id: number; reason: string }> = [];
      const valid: ManualScoreHistory[] = [];
      await cache.lockUsers(records.map((record) => record.user_id));
      for (const record of records) {
        const reason = await repository.referencesExist(record);
        if (reason === null) valid.push(record);
        else failed.push({ user_id: record.user_id, reason });
      }
      await repository.insertManual(valid);
      await cache.refreshUsers(
        valid.map((record) => record.user_id),
        this.clock(),
      );
      return { insertedCount: valid.length, failed };
    });
  }
  async list(page: number, limit: number, username: string | undefined) {
    return this.reader.withSession((database) =>
      new ScoreHistoryRepository(database).list(page, limit, username),
    );
  }
  async update(id: number, patch: ScoreHistoryPatch) {
    const owner = await this.reader.withSession((database) =>
      new ScoreHistoryRepository(database).findOwner(id),
    );
    if (owner === null) return false;
    return this.transactions.unitOfWork(async (database) => {
      const cache = new MonthlyScoreCacheRepository(database);
      await cache.lockUsers([owner]);
      const updated = await new ScoreHistoryRepository(database).updateForUser(
        id,
        owner,
        patch,
      );
      if (updated) await cache.refreshUsers([owner], this.clock());
      return updated;
    });
  }
  async remove(id: number) {
    const owner = await this.reader.withSession((database) =>
      new ScoreHistoryRepository(database).findOwner(id),
    );
    if (owner === null) return false;
    return this.transactions.unitOfWork(async (database) => {
      const cache = new MonthlyScoreCacheRepository(database);
      await cache.lockUsers([owner]);
      const removed = await new ScoreHistoryRepository(database).removeForUser(
        id,
        owner,
      );
      if (removed) await cache.refreshUsers([owner], this.clock());
      return removed;
    });
  }
}
