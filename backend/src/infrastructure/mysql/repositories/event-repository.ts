import { z } from "zod";
import type { DatabaseExecutor } from "../database-session.js";
import { sqlOperations } from "../database-session.js";

const eventRowSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  desc: z.string().nullable(),
  begin: z.date(),
  end: z.date(),
  created_at: z.date(),
});
const eventListRowSchema = eventRowSchema.extend({
  problem_count: z.coerce.number().int().nonnegative(),
});
const recentRowSchema = z.object({
  event_title: z.string(),
  begin: z.date(),
  end: z.date(),
  problems: z.string().nullable(),
});
const problemRowSchema = z.object({ problem: z.number().int().positive() });
const idRowSchema = z.object({ id: z.number().int().positive() });
export type EventRow = Readonly<z.output<typeof eventRowSchema>>;
export type EventListRow = Readonly<z.output<typeof eventListRowSchema>>;
export type RecentEventRow = Readonly<z.output<typeof recentRowSchema>>;
export interface EventRepositoryPort {
  create(
    input: Readonly<{
      title: string;
      desc: string | null;
      begin: Date;
      end: Date;
    }>,
  ): Promise<number>;
  lock(id: number): Promise<boolean>;
  update(
    id: number,
    input: Readonly<{
      title: string;
      desc: string | null;
      begin: Date;
      end: Date;
    }>,
  ): Promise<void>;
  remove(id: number): Promise<void>;
  problems(id: number): Promise<readonly number[]>;
  replaceProblems(id: number, problems: readonly number[]): Promise<void>;
}

export class EventRepository implements EventRepositoryPort {
  constructor(private readonly database: DatabaseExecutor) {}

  async create(
    input: Readonly<{
      title: string;
      desc: string | null;
      begin: Date;
      end: Date;
    }>,
  ): Promise<number> {
    const result = await this.database.execute(
      sqlOperations.eventCreate,
      "INSERT INTO event (title, `desc`, begin, end) VALUES (?, ?, ?, ?)",
      [input.title, input.desc, input.begin, input.end],
    );
    return result.insertId;
  }

  async find(id: number): Promise<EventRow | undefined> {
    return this.database.selectOne(
      sqlOperations.eventFind,
      "SELECT id, title, `desc`, begin, end, created_at FROM event WHERE id = ?",
      [id],
      eventRowSchema,
    );
  }

  async lock(id: number): Promise<boolean> {
    return (
      (await this.database.selectOne(
        sqlOperations.eventLock,
        "SELECT id FROM event WHERE id = ? FOR UPDATE",
        [id],
        idRowSchema,
      )) !== undefined
    );
  }

  async update(
    id: number,
    input: Readonly<{
      title: string;
      desc: string | null;
      begin: Date;
      end: Date;
    }>,
  ): Promise<void> {
    await this.database.execute(
      sqlOperations.eventUpdate,
      "UPDATE event SET title = ?, `desc` = ?, begin = ?, end = ? WHERE id = ?",
      [input.title, input.desc, input.begin, input.end, id],
    );
  }

  async remove(id: number): Promise<void> {
    await this.database.execute(
      sqlOperations.eventDelete,
      "DELETE FROM event WHERE id = ?",
      [id],
    );
  }

  async problems(id: number): Promise<readonly number[]> {
    const rows = await this.database.select(
      sqlOperations.eventProblemsList,
      "SELECT problem FROM event_problem WHERE event_id = ? ORDER BY problem ASC",
      [id],
      problemRowSchema,
    );
    return rows.map((row) => row.problem);
  }

  async replaceProblems(
    id: number,
    problems: readonly number[],
  ): Promise<void> {
    const current = await this.problems(id);
    const requested = new Set(problems);
    const removed = current.filter((problem) => !requested.has(problem));
    if (removed.length > 0)
      await this.database.execute(
        sqlOperations.eventProblemsDelete,
        `DELETE FROM event_problem WHERE event_id = ? AND problem IN (${removed.map(() => "?").join(", ")})`,
        [id, ...removed],
      );
    const existing = new Set(current);
    const added = problems.filter((problem) => !existing.has(problem));
    if (added.length > 0)
      await this.database.execute(
        sqlOperations.eventProblemsInsert,
        `INSERT INTO event_problem (event_id, problem, added_at) VALUES ${added.map(() => "(?, ?, CURRENT_TIMESTAMP)").join(", ")}`,
        added.flatMap((problem) => [id, problem]),
      );
  }

  async count(): Promise<number> {
    const row = await this.database.selectOne(
      sqlOperations.eventList,
      "SELECT COUNT(*) AS total FROM event",
      [],
      z.object({ total: z.coerce.number().int().nonnegative() }),
    );
    return row?.total ?? 0;
  }
  list(limit: number, offset: number): Promise<readonly EventListRow[]> {
    return this.database.select(
      sqlOperations.eventList,
      "SELECT e.id, e.title, e.`desc`, e.begin, e.end, e.created_at, COUNT(ep.problem) AS problem_count FROM event e LEFT JOIN event_problem ep ON e.id = ep.event_id GROUP BY e.id ORDER BY e.created_at DESC LIMIT ? OFFSET ?",
      [limit, offset],
      eventListRowSchema,
    );
  }
  recent(ongoing: boolean): Promise<readonly RecentEventRow[]> {
    const predicate = ongoing
      ? "e.begin <= UTC_TIMESTAMP() AND e.end >= UTC_TIMESTAMP()"
      : "e.end < UTC_TIMESTAMP()";
    const order = ongoing ? "ASC" : "DESC";
    return this.database.select(
      ongoing ? sqlOperations.eventOngoing : sqlOperations.eventPast,
      `SELECT e.title AS event_title, e.begin, e.end, GROUP_CONCAT(ep.problem ORDER BY ep.id) AS problems FROM event e LEFT JOIN event_problem ep ON e.id = ep.event_id WHERE ${predicate} GROUP BY e.id ORDER BY e.end ${order} LIMIT 3`,
      [],
      recentRowSchema,
    );
  }
}
