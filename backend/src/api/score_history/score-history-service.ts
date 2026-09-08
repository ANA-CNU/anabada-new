import type { DatabaseExecutor } from "../../infrastructure/mysql/database-session.js";
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
  ) {}
  async bulk(records: readonly ManualScoreHistory[]) {
    return this.transactions.unitOfWork(async (database) => {
      const repository = new ScoreHistoryRepository(database);
      const failed: Array<{ user_id: number; reason: string }> = [];
      const valid: ManualScoreHistory[] = [];
      for (const record of records) {
        const reason = await repository.referencesExist(record);
        if (reason === null) valid.push(record);
        else failed.push({ user_id: record.user_id, reason });
      }
      await repository.insertManual(valid);
      return { insertedCount: valid.length, failed };
    });
  }
  async list(page: number, limit: number, username: string | undefined) {
    return this.reader.withSession((database) =>
      new ScoreHistoryRepository(database).list(page, limit, username),
    );
  }
  async update(id: number, patch: ScoreHistoryPatch) {
    return this.transactions.unitOfWork((database) =>
      new ScoreHistoryRepository(database).update(id, patch),
    );
  }
  async remove(id: number) {
    return this.transactions.unitOfWork((database) =>
      new ScoreHistoryRepository(database).remove(id),
    );
  }
}
