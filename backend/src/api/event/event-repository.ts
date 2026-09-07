import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { EventInput } from './event-input.js';

export class EventNotFoundError extends Error {
  readonly name = 'EventNotFoundError';
  constructor(readonly eventId: number) { super('해당 이벤트를 찾을 수 없습니다.'); }
}

async function transaction<T>(pool: Pick<Pool, 'getConnection'>, operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      connection.destroy();
      throw new AggregateError([error, rollbackError], 'Event transaction rollback failed');
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function lockEvent(connection: PoolConnection, eventId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT id FROM event WHERE id = ? FOR UPDATE', [eventId]);
  if (rows.length === 0) throw new EventNotFoundError(eventId);
}

async function insertProblems(connection: PoolConnection, eventId: number, problems: readonly number[]) {
  if (problems.length === 0) return;
  await connection.execute(
    `INSERT INTO event_problem (event_id, problem, added_at) VALUES ${problems.map(() => '(?, ?, CURRENT_TIMESTAMP)').join(', ')}`,
    problems.flatMap(problem => [eventId, problem]),
  );
}

export function createEvent(pool: Pick<Pool, 'getConnection'>, input: EventInput) {
  return transaction(pool, async connection => {
    const [result] = await connection.execute<ResultSetHeader>(
      'INSERT INTO event (title, `desc`, begin, end, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [input.title, input.desc, input.begin, input.end],
    );
    await insertProblems(connection, result.insertId, input.problems);
    return result.insertId;
  });
}

export function updateEvent(pool: Pick<Pool, 'getConnection'>, eventId: number, input: EventInput) {
  return transaction(pool, async connection => {
    await lockEvent(connection, eventId);
    await connection.execute('UPDATE event SET title = ?, `desc` = ?, begin = ?, end = ? WHERE id = ?',
      [input.title, input.desc, input.begin, input.end, eventId]);
    const [existing] = await connection.execute<(RowDataPacket & { readonly problem: number })[]>(
      'SELECT problem FROM event_problem WHERE event_id = ? FOR UPDATE', [eventId]);
    const retained = new Set(input.problems);
    const removed = existing.map(row => row.problem).filter(problem => !retained.has(problem));
    if (removed.length > 0) {
      await connection.execute(`DELETE FROM event_problem WHERE event_id = ? AND problem IN (${removed.map(() => '?').join(', ')})`, [eventId, ...removed]);
    }
    const previous = new Set(existing.map(row => row.problem));
    await insertProblems(connection, eventId, input.problems.filter(problem => !previous.has(problem)));
  });
}

export function deleteEvent(pool: Pick<Pool, 'getConnection'>, eventId: number) {
  return transaction(pool, async connection => {
    await lockEvent(connection, eventId);
    await connection.execute('DELETE FROM event_problem WHERE event_id = ?', [eventId]);
    await connection.execute('DELETE FROM event WHERE id = ?', [eventId]);
  });
}
