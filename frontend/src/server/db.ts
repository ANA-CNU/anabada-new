import "server-only";

import { createPool } from "mysql2/promise";

export const db = createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? "3306"),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "boj_bada",
  timezone: "Z",
  connectionLimit: 10,
  connectTimeout: 5_000,
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
});
