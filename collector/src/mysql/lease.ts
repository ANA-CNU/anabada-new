import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

interface LockRow extends RowDataPacket {
  readonly acquired: number | string | null;
}

export class LeaseError extends Error {
  override readonly name = "LeaseError";
  readonly code = "lease_acquisition_failed";
  constructor() {
    super("lease_acquisition_failed");
  }
}

export class CycleLease {
  private released = false;
  constructor(
    private readonly connection: PoolConnection,
    private readonly name: string,
  ) {}

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    try {
      await this.connection.execute("SELECT RELEASE_LOCK(?)", [this.name]);
    } finally {
      this.connection.destroy();
    }
  }
}

/** 여러 collector container 중 하나만 외부 요청을 시작하도록 DB advisory lock을 소유한다. */
export class CycleLeaseManager {
  constructor(
    private readonly pool: Pool,
    private readonly name = "jungol_bada:collector",
  ) {}

  async acquire(): Promise<CycleLease | null> {
    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.execute<LockRow[]>(
        "SELECT GET_LOCK(?, 0) AS acquired",
        [this.name],
      );
      if (Number(rows[0]?.acquired) === 1)
        return new CycleLease(connection, this.name);
      if (rows[0]?.acquired === null || rows[0]?.acquired === undefined)
        throw new LeaseError();
      connection.release();
      return null;
    } catch (error) {
      connection.destroy();
      throw error;
    }
  }
}
