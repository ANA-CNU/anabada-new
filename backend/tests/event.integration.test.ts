import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import pino from 'pino';

const databaseUrl = process.env.TEST_DATABASE_URL;
const pool = mysql.createPool(databaseUrl || 'mysql://root:qa@127.0.0.1/backend_qa');
const { createApplication } = await import('../src/index.js');
mock.module('../src/index.js', () => ({
  createApplication,
  logger: pino({ level: 'silent' }),
}));
mock.module('../src/db/database.js', () => ({ getDatabase: () => pool }));
mock.module('../src/auth.js', () => ({
  checkAdminAuth: (request: Request) => ({
    isAuthenticated: request.headers.get('authorization') === 'test-admin',
    user: { username: 'test-admin' },
  }),
}));
const { event } = await import('../src/api/event/event.js');
const input = { title: 'original', desc: 'description', begin: '2026-09-01 00:00:00', end: '2026-09-30 23:59:59', problems: [1000, 1001] };
async function request(method: string, path: string, body?: unknown, authorized = true) {
  const response = await event.handle(new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: authorized ? 'test-admin' : '' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  const result: unknown = await response.json();
  return result;
}
async function state() {
  const [events] = await pool.query<(RowDataPacket & { readonly id: number; readonly title: string })[]>('SELECT id, title FROM event ORDER BY id');
  const [problems] = await pool.query<(RowDataPacket & { readonly event_id: number; readonly problem: number })[]>('SELECT event_id, problem FROM event_problem ORDER BY problem');
  return { events: events.map(({ id, title }) => ({ id, title })), problems: problems.map(({ event_id, problem }) => ({ event_id, problem })) };
}

describe.skipIf(!databaseUrl)('event HTTP contract and MySQL atomicity', () => {
  beforeAll(async () => {
    await pool.query('CREATE TABLE event (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, `desc` TEXT, begin DATETIME NOT NULL, end DATETIME NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    await pool.query('CREATE TABLE event_problem (id INT AUTO_INCREMENT PRIMARY KEY, event_id INT NOT NULL, problem INT NOT NULL, added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(event_id, problem), FOREIGN KEY (event_id) REFERENCES event(id))');
  });
  beforeEach(async () => {
    await pool.query('DROP TRIGGER IF EXISTS reject_event_delete');
    await pool.query('DELETE FROM event_problem');
    await pool.query('DELETE FROM event');
    await pool.query('ALTER TABLE event AUTO_INCREMENT = 1');
  });
  afterAll(async () => {
    await pool.query('DROP TRIGGER IF EXISTS reject_event_delete');
    await pool.query('DROP TABLE event_problem');
    await pool.query('DROP TABLE event');
    await pool.end();
  });
  test('create returns the established fields when authorized', async () => {
    // Given / When
    const result = await request('POST', '/api/event/create', input);
    // Then
    expect(result).toEqual({ success: true, event_id: 1, message: '이벤트 및 문제 등록 성공', problems_count: 2 });
  });
  test('create rejects requests when unauthenticated', async () => {
    // Given / When
    const result = await request('POST', '/api/event/create', input, false);
    // Then
    expect(result).toEqual({ success: false, message: '관리자 권한이 필요합니다.' });
    expect(await state()).toEqual({ events: [], problems: [] });
  });
  test('detail preserves its response shape', async () => {
    // Given
    await request('POST', '/api/event/create', input);
    // When
    const result = await request('GET', '/api/events/1');
    // Then
    expect(result).toMatchObject({ success: true, data: { id: 1, title: 'original', desc: 'description', begin: '2026-09-01T00:00:00+09:00', end: '2026-09-30T23:59:59+09:00', problems: [1000, 1001] } });
  });
  test('update accepts the established comma-separated problem contract', async () => {
    // Given
    await request('POST', '/api/event/create', input);
    // When
    const result = await request('PUT', '/api/events/1', { ...input, title: 'updated', problems: '1002, 1003' });
    // Then
    expect(result).toEqual({ success: true, message: '이벤트가 성공적으로 수정되었습니다.' });
    expect(await state()).toEqual({ events: [{ id: 1, title: 'updated' }], problems: [{ event_id: 1, problem: 1002 }, { event_id: 1, problem: 1003 }] });
  });
  test('delete returns the established success response', async () => {
    // Given
    await request('POST', '/api/event/create', input);
    // When
    const result = await request('DELETE', '/api/events/1');
    // Then
    expect(result).toEqual({ success: true, message: '이벤트가 성공적으로 삭제되었습니다.' });
    expect(await state()).toEqual({ events: [], problems: [] });
  });
  test('create rolls back the event when unique problem insertion fails', async () => {
    // Given / When
    const result = await request('POST', '/api/event/create', { ...input, problems: [1000, 1000] });
    // Then
    expect(result).toMatchObject({ success: false });
    expect(await state()).toEqual({ events: [], problems: [] });
  });
  test('update rolls back metadata and problems when insertion fails', async () => {
    // Given
    await request('POST', '/api/event/create', input);
    const original = await state();
    // When
    const result = await request('PUT', '/api/events/1', { ...input, title: 'corrupted', problems: '1002,1002' });
    // Then
    expect(result).toMatchObject({ success: false });
    expect(await state()).toEqual(original);
  });
  test('delete rolls back problem removal when event deletion fails', async () => {
    // Given
    await request('POST', '/api/event/create', input);
    const original = await state();
    await pool.query("CREATE TRIGGER reject_event_delete BEFORE DELETE ON event FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected delete failure'");
    // When
    const result = await request('DELETE', '/api/events/1');
    // Then
    expect(result).toMatchObject({ success: false });
    expect(await state()).toEqual(original);
  });
  test('update preserves membership timestamps for retained problems', async () => {
    await request('POST', '/api/event/create', input);
    await pool.query("UPDATE event_problem SET added_at = '2026-01-01 00:00:00'");
    const result = await request('PUT', '/api/events/1', { ...input, problems: '1000,1002' });
    expect(result).toMatchObject({ success: true });
    const [rows] = await pool.query<RowDataPacket[]>("SELECT problem, added_at = '2026-01-01 00:00:00' AS retained FROM event_problem ORDER BY problem");
    expect(rows.map(row => ({ problem: row.problem, retained: row.retained }))).toEqual([{ problem: 1000, retained: 1 }, { problem: 1002, retained: 0 }]);
  });
  test('malformed update input leaves existing rows untouched', async () => {
    await request('POST', '/api/event/create', input);
    const original = await state();
    const result = await request('PUT', '/api/events/1', { ...input, problems: '1002,invalid' });
    expect(result).toMatchObject({ success: false });
    expect(await state()).toEqual(original);
  });
  test('concurrent updates leave one complete event state', async () => {
    await request('POST', '/api/event/create', input);
    const results = await Promise.all([
      request('PUT', '/api/events/1', { ...input, title: 'first', problems: '2000,2001' }),
      request('PUT', '/api/events/1', { ...input, title: 'second', problems: '3000,3001' }),
    ]);
    expect(results).toEqual([{ success: true, message: '이벤트가 성공적으로 수정되었습니다.' }, { success: true, message: '이벤트가 성공적으로 수정되었습니다.' }]);
    const final = await state();
    const first = final.events[0]?.title === 'first';
    expect(final.problems.map(row => row.problem)).toEqual(first ? [2000, 2001] : [3000, 3001]);
  });
  test('missing events retain the established failure message', async () => {
    const result = await request('PUT', '/api/events/99', { ...input, problems: '' });
    expect(result).toEqual({ success: false, message: '해당 이벤트를 찾을 수 없습니다.' });
  });
  test('list preserves pagination and count fields', async () => {
    await request('POST', '/api/event/create', input);
    const result = await request('GET', '/api/events?page=0&limit=999');
    expect(result).toMatchObject({ success: true, pagination: { page: 1, limit: 100, total: 1, total_pages: 1 }, data: [{ id: 1, problem_count: 2 }] });
  });
});
