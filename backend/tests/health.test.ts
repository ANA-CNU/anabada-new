import { afterAll, describe, expect, test } from 'bun:test';
import mysql, { type PoolConnection } from 'mysql2/promise';
import { createHealthRoute } from '../src/api/health.js';

const unavailableBody = { status: 'unhealthy', message: 'Database is not ready' };
class DatabaseUnavailableError extends Error {
  readonly name = 'DatabaseUnavailableError';
  constructor() { super('secret hostname and credentials'); }
}
test('health returns a sanitized 503 when the database is unavailable', async () => {
  let reported = 0;
  const route = createHealthRoute(
    () => ({ getConnection: async () => { throw new DatabaseUnavailableError(); } }),
    { databaseUnavailable: () => { reported += 1; } },
  );
  const response = await route.handle(new Request('http://localhost/health'));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual(unavailableBody);
  expect(reported).toBe(1);
});
test('health bounds a stalled pool acquisition', async () => {
  const route = createHealthRoute(() => ({ getConnection: () => new Promise<PoolConnection>(() => {}) }));
  const response = await route.handle(new Request('http://localhost/health'));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual(unavailableBody);
}, 2500);

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('health MySQL connectivity', () => {
  const pool = mysql.createPool(databaseUrl || 'mysql://root:qa@127.0.0.1/backend_qa');
  const route = createHealthRoute(() => pool);
  afterAll(async () => {
    await pool.end();
  });
  test('health returns the original healthy fields when the database accepts queries', async () => {
    const response = await route.handle(new Request('http://localhost/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'healthy', timestamp: expect.any(String), uptime: expect.any(Number) });
  });
});
