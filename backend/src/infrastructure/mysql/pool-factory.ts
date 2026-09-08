import mysql from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import type { BackendConfig } from "../../config/backend-config.js";
import { type DatabaseConnection, DatabasePool } from "./database-session.js";

export type InitializedDatabase = Readonly<{
  readonly rawPool: Pool;
  readonly pool: DatabasePool;
  readonly close: () => Promise<void>;
}>;

export async function initializeDatabase(
  config: BackendConfig,
): Promise<InitializedDatabase> {
  const rawPool = mysql.createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    charset: "utf8mb4",
    timezone: "Z",
    connectionLimit: 10,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    dateStrings: false,
  });
  try {
    const connection = await rawPool.getConnection();
    try {
      await connection.ping();
    } finally {
      connection.release();
    }
    const databasePool = new DatabasePool({
      getConnection: async (): Promise<DatabaseConnection> => {
        const connection = await rawPool.getConnection();
        return {
          query: async (options) =>
            connection.query({ ...options, values: [...options.values] }),
          beginTransaction: () => connection.beginTransaction(),
          commit: () => connection.commit(),
          rollback: () => connection.rollback(),
          release: () => connection.release(),
          destroy: () => connection.destroy(),
        };
      },
    });
    return { rawPool, pool: databasePool, close: () => rawPool.end() };
  } catch (error) {
    await rawPool.end();
    throw error;
  }
}
