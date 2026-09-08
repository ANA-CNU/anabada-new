import mysql from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import type { BackendConfig } from "../config/backend-config.js";

let connectionPool: Pool | undefined;

/** 연결 생성은 import가 아닌 bootstrap에서 실행해 테스트와 CLI의 외부 I/O를 분리한다. */
export async function initializeDatabase(config: BackendConfig): Promise<Pool> {
  const pool = mysql.createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    charset: "utf8mb4",
    timezone: "Z",
    connectionLimit: 10,
  });
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    connectionPool = pool;
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  } finally {
    connection.release();
  }
}

/** 기존 route가 단계적으로 새 세션 경계로 이동할 때까지 유지하는 최소 호환 accessor다. */
export function getDatabase(): Pool {
  if (connectionPool) return connectionPool;
  throw new Error("Database has not been initialized");
}
export async function closeDatabase(): Promise<void> {
  const pool = connectionPool;
  connectionPool = undefined;
  if (pool) await pool.end();
}
