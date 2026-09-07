import { type Connection, createPool, type QueryError } from "mysql2";
import type { Pool } from "mysql2/promise";
import type { CollectorConfig, Credentials } from "../config.js";

/** collector 전용 계정과 UTC session 계약을 적용한 MySQL pool을 생성한다. */
export class CollectorPoolFactory {
  create(config: CollectorConfig, credentials: Credentials): Pool {
    const pool = createPool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: credentials.databasePassword,
      database: config.database.name,
      connectionLimit: config.concurrency + 2,
      maxIdle: config.concurrency + 2,
      waitForConnections: true,
      queueLimit: config.concurrency * 4 + 4,
      connectTimeout: 10000,
      idleTimeout: 60000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      timezone: "Z",
      supportBigNumbers: true,
      bigNumberStrings: true,
      multipleStatements: false,
      flags: ["-FOUND_ROWS"],
    });
    pool.on("connection", (connection: Connection) => {
      connection.query(
        "SET time_zone = '+00:00'",
        (error: QueryError | null) => {
          if (error) connection.destroy();
        },
      );
    });
    return pool.promise();
  }
}
