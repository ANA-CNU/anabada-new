import type { Pool, RowDataPacket } from "mysql2/promise";

type Lease = "boj_bada:collector" | "boj_bada:solved-ac";
interface LockRow extends RowDataPacket {
  readonly acquired: 0 | 1 | "0" | "1" | null;
}

export async function withBojLease<T>(
  pool: Pool,
  name: Lease,
  work: () => Promise<T>,
): Promise<T | null> {
  const connection = await pool.getConnection();
  let acquired: boolean;
  try {
    const [rows] = await connection.execute<LockRow[]>(
      "SELECT GET_LOCK(?,0) AS acquired",
      [name],
    );
    const value = rows[0]?.acquired;
    acquired = value === 1 || value === "1";
  } catch (error) {
    connection.destroy();
    throw error;
  }
  if (!acquired) {
    connection.release();
    return null;
  }
  try {
    return await work();
  } finally {
    try {
      await connection.execute("SELECT RELEASE_LOCK(?)", [name]);
      connection.release();
    } catch {
      connection.destroy();
    }
  }
}
