import type { Pool } from "mysql2/promise";
import type { KstCalendar } from "../scoring/daily.js";
import { AttemptRepository } from "./attempts.js";
import {
  BiasRepository,
  EventRepository,
  ScoreHistoryRepository,
} from "./awards.js";
import { UserRepository } from "./users.js";

export type AccountRepositories = {
  readonly users: UserRepository;
  readonly attempts: AttemptRepository;
  readonly events: EventRepository;
  readonly scores: ScoreHistoryRepository;
  readonly bias: BiasRepository;
};

/** 사용자 한 명의 모든 쓰기를 같은 connection에서 commit하거나 rollback한다. */
export class AccountUnitOfWork {
  constructor(
    private readonly pool: Pool,
    private readonly calendar: KstCalendar,
  ) {}

  async execute<T>(
    operation: (repositories: AccountRepositories) => Promise<T>,
  ): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.query("SET SESSION innodb_lock_wait_timeout=15");
      await connection.query(
        "SET SESSION lock_wait_timeout=15, max_execution_time=30000",
      );
      await connection.beginTransaction();
      const result = await operation({
        users: new UserRepository(connection),
        attempts: new AttemptRepository(connection),
        events: new EventRepository(connection),
        scores: new ScoreHistoryRepository(connection),
        bias: new BiasRepository(connection, this.calendar),
      });
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
