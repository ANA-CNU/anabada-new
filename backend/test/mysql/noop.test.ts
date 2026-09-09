import { expect, test } from "bun:test";
import type { RowDataPacket } from "mysql2";
import { createMysqlTestContext } from "./context.js";

type NoopCounts = RowDataPacket &
  Readonly<{
    readonly migration_count: number;
    readonly sentinel_count: number;
  }>;

test("Given seeded MySQL When the migrator is run again Then the migration and seed sentinel remain", async () => {
  const context = await createMysqlTestContext();
  try {
    const [rows] = await context.rawPool.query<NoopCounts[]>(
      "SELECT (SELECT COUNT(*) FROM migrations WHERE version = 2) AS migration_count, (SELECT COUNT(*) FROM hook WHERE url = 'https://enabled.invalid/hook') AS sentinel_count",
    );
    const counts = rows.map((row) => ({
      migration_count: Number(row.migration_count),
      sentinel_count: Number(row.sentinel_count),
    }));
    expect(counts).toEqual([{ migration_count: 1, sentinel_count: 1 }]);
    expect(context.observedOperationIds).toEqual(new Set());
  } finally {
    await context.close();
  }
});
