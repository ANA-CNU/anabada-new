import { Elysia } from 'elysia';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { logger } from '../logger.js';

export interface HealthFailureReporter {
  databaseUnavailable(): void;
}

const defaultFailureReporter: HealthFailureReporter = {
  databaseUnavailable: () => {
    logger.error({ code: 'database_unavailable' }, 'backend.database_unavailable');
  },
};

async function databaseReady(getPool: () => Pick<Pool, 'getConnection'>): Promise<boolean> {
  let connection: PoolConnection | undefined;
  let expired = false;
  const deadline = Promise.withResolvers<boolean>();
  const timer = setTimeout(() => {
    expired = true;
    connection?.destroy();
    deadline.resolve(false);
  }, 1500);
  const probe = async () => {
    connection = await getPool().getConnection();
    try {
      if (expired) return false;
      const [rows] = await connection.query<RowDataPacket[]>({
        sql: 'SELECT 1 AS ready',
        timeout: 1000,
      });
      return rows.length === 1;
    } catch (error) {
      connection.destroy();
      throw error;
    } finally {
      connection.release();
    }
  };
  try {
    return await Promise.race([probe(), deadline.promise]);
  } catch (error) {
    if (error instanceof Error) return false;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function createHealthRoute(
  getPool: () => Pick<Pool, 'getConnection'>,
  reporter: HealthFailureReporter = defaultFailureReporter,
) {
  return new Elysia().get('/health', async ({ set }) => {
    if (!(await databaseReady(getPool))) {
      reporter.databaseUnavailable();
      set.status = 503;
      return { status: 'unhealthy', message: 'Database is not ready' };
    }
    return { status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() };
  });
}
