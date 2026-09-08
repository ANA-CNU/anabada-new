import type { DatabaseExecutor } from "../../infrastructure/mysql/database-session.js";
import { BiasRepository } from "../../infrastructure/mysql/repositories/bias-repository.js";

export interface BiasUnitOfWork {
  unitOfWork<T>(work: (database: DatabaseExecutor) => Promise<T>): Promise<T>;
}
export interface BiasReader {
  withSession<T>(work: (database: DatabaseExecutor) => Promise<T>): Promise<T>;
}
export class BiasService {
  constructor(
    private readonly reader: BiasReader,
    private readonly transactions: BiasUnitOfWork,
  ) {}
  async initialize(beginUtc: Date, endUtc: Date) {
    return this.transactions.unitOfWork((database) =>
      new BiasRepository(database).replaceTotals(beginUtc, endUtc),
    );
  }
  async list() {
    return this.reader.withSession((database) =>
      new BiasRepository(database).list(),
    );
  }
}
