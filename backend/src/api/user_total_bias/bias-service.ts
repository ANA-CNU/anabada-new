import type { DatabaseExecutor } from "../../infrastructure/mysql/database-session.js";
import { BiasRepository } from "../../infrastructure/mysql/repositories/bias-repository.js";

export interface BiasUnitOfWork {
  unitOfWork<T>(work: (database: DatabaseExecutor) => Promise<T>): Promise<T>;
}
export interface BiasReader {
  withSession<T>(work: (database: DatabaseExecutor) => Promise<T>): Promise<T>;
}
export const isCurrentKstMonthWindow = (
  beginUtc: Date,
  endUtc: Date,
  now: Date,
): boolean => {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1) - 9 * 60 * 60 * 1_000);
  const end = new Date(Date.UTC(year, month + 1, 1) - 9 * 60 * 60 * 1_000);
  return beginUtc.getTime() === start.getTime() && endUtc.getTime() === end.getTime();
};
export class BiasService {
  constructor(
    private readonly reader: BiasReader,
    private readonly transactions: BiasUnitOfWork,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async initialize(beginUtc: Date, endUtc: Date) {
    if (!isCurrentKstMonthWindow(beginUtc, endUtc, this.clock())) return null;
    return this.transactions.unitOfWork((database) =>
      new BiasRepository(database).replaceTotals(beginUtc, endUtc),
    );
  }
  async list() {
    return this.reader.withSession((database) =>
      new BiasRepository(database).list(this.clock()),
    );
  }
}
