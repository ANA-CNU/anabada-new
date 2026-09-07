import { Elysia } from 'elysia';
import type { RowDataPacket } from 'mysql2/promise';
import { getDatabase } from '../../db/database.js';
import { logger } from '../../index.js';
import { parseEventId } from './event-input.js';

const dates = `CONCAT(DATE_FORMAT(begin, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS begin,
  CONCAT(DATE_FORMAT(end, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS end,
  CONCAT(DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS created_at`;
function failure(error: unknown, message: string) {
  logger.error({ err: error }, message);
  return { success: false, error: error instanceof Error ? error.message : String(error), message };
}
async function recentEvents(ongoing: boolean) {
  const label = ongoing ? '현재 진행중인' : '과거 진행된';
  const connection = await getDatabase().getConnection();
  try {
    await connection.execute("SET time_zone = '+09:00'");
    const [data] = await connection.execute<RowDataPacket[]>(`
      SELECT e.title AS event_title,
        CONCAT(DATE_FORMAT(e.begin, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS startDate,
        CONCAT(DATE_FORMAT(e.end, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS endDate,
        GROUP_CONCAT(ep.problem ORDER BY ep.id) AS problems
      FROM event e LEFT JOIN event_problem ep ON e.id = ep.event_id
      WHERE ${ongoing ? 'e.begin <= NOW() AND e.end >= NOW()' : 'e.end < NOW()'}
      GROUP BY e.id ORDER BY e.end ${ongoing ? 'ASC' : 'DESC'} LIMIT 3`);
    return { success: true, data, message: `${label} 이벤트 조회 성공`, summary: { count: data.length, status: ongoing ? '진행중' : '종료됨', max_limit: 3 } };
  } finally {
    connection.release();
  }
}

export const eventReads = new Elysia()
  .get('/api/events/ongoing', async () => {
    try { return await recentEvents(true); }
    catch (error) {
      if (error instanceof Error) return failure(error, '현재 진행중인 이벤트 조회에 실패했습니다.');
      throw error;
    }
  })
  .get('/api/events/past', async () => {
    try { return await recentEvents(false); }
    catch (error) {
      if (error instanceof Error) return failure(error, '과거 진행된 이벤트 조회에 실패했습니다.');
      throw error;
    }
  })
  .get('/api/events', async ({ query }) => {
    try {
      const db = getDatabase();
      const page = Math.max(parseInt(query.page || '') || 1, 1);
      const limit = Math.min(Math.max(parseInt(query.limit || '') || 10, 1), 100);
      const [counts] = await db.execute<(RowDataPacket & { readonly total: number })[]>('SELECT COUNT(*) as total FROM event');
      const total = counts[0]?.total ?? 0;
      const [data] = await db.execute<RowDataPacket[]>(`
        SELECT e.id, e.title, e.\`desc\`,
          CONCAT(DATE_FORMAT(e.begin, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS begin,
          CONCAT(DATE_FORMAT(e.end, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS end,
          CONCAT(DATE_FORMAT(e.created_at, '%Y-%m-%dT%H:%i:%s'), '+09:00') AS created_at,
          COUNT(ep.problem) as problem_count
        FROM event e LEFT JOIN event_problem ep ON e.id = ep.event_id
        GROUP BY e.id ORDER BY e.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`);
      return { success: true, data, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }, message: '이벤트 목록 조회 성공' };
    } catch (error) {
      if (error instanceof Error) return failure(error, '이벤트 목록 조회에 실패했습니다.');
      throw error;
    }
  })
  .get('/api/events/:id', async ({ params }) => {
    const eventId = parseEventId(params.id);
    if (eventId === null) return { success: false, message: '유효하지 않은 이벤트 ID입니다.' };
    try {
      const db = getDatabase();
      const [events] = await db.execute<RowDataPacket[]>(`SELECT id, title, \`desc\`, ${dates} FROM event WHERE id = ?`, [eventId]);
      const event = events[0];
      if (!event) return { success: false, message: '해당 이벤트를 찾을 수 없습니다.' };
      const [problems] = await db.execute<(RowDataPacket & { readonly problem: number })[]>('SELECT problem FROM event_problem WHERE event_id = ? ORDER BY problem ASC', [eventId]);
      return { success: true, data: { ...event, problems: problems.map(row => row.problem) }, message: '이벤트 상세 조회 성공' };
    } catch (error) {
      if (error instanceof Error) return failure(error, '이벤트 상세 조회에 실패했습니다.');
      throw error;
    }
  });
