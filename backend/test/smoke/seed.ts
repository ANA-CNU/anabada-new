import { createPool } from "mysql2/promise";
import { SeedDatabase } from "../mysql/seed-database.js";

const pool = createPool({
  host: process.env.DB_HOST ?? "anabada-mysql",
  port: Number(process.env.DB_PORT ?? "3306"),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "jungol_bada",
  waitForConnections: true,
  connectionLimit: 1,
});

try {
  await new SeedDatabase(pool).resetAndSeed();
} finally {
  await pool.end();
}
