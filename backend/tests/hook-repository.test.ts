import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type {
  DatabaseExecutor,
  SqlOperation,
  SqlParameter,
} from "../src/infrastructure/mysql/database-session.js";
import { HookRepository } from "../src/infrastructure/mysql/repositories/hook-repository.js";

type Call = Readonly<{
  readonly operation: string;
  readonly sql: string;
  readonly values: readonly SqlParameter[];
}>;
class FakeExecutor implements DatabaseExecutor {
  readonly calls: Call[] = [];
  constructor(
    private readonly rows: readonly unknown[] = [],
    private readonly affectedRows = 1,
  ) {}
  async select<T>(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<readonly T[]> {
    this.calls.push({ operation: operation.id, sql, values });
    const rows =
      operation.id === "hook.count"
        ? this.rows.filter(
            (row) => typeof row === "object" && row !== null && "total" in row,
          )
        : this.rows.filter(
            (row) => typeof row === "object" && row !== null && "id" in row,
          );
    return rows.map((row) => schema.parse(row));
  }
  async selectOne<T>(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T | undefined> {
    return (await this.select(operation, sql, values, schema))[0];
  }
  async execute(
    operation: SqlOperation,
    sql: string,
    values: readonly SqlParameter[],
  ) {
    this.calls.push({ operation: operation.id, sql, values });
    return { affectedRows: this.affectedRows, insertId: 42 };
  }
}

describe("HookRepository", () => {
  test("lists parameterized rows and transforms database values", async () => {
    const executor = new FakeExecutor([
      { total: 1 },
      {
        id: 7,
        url: "https://example.test/hook",
        ignored: 1,
        created_at: new Date("2026-01-02T03:04:05.000Z"),
      },
    ]);
    const result = await new HookRepository(executor).list({
      page: 2,
      limit: 10,
    });
    expect(result).toEqual({
      total: 1,
      items: [
        {
          id: 7,
          url: "https://example.test/hook",
          ignored: true,
          created_at: "2026-01-02T03:04:05.000Z",
        },
      ],
    });
    expect(executor.calls).toEqual([
      {
        operation: "hook.count",
        sql: "SELECT COUNT(*) AS total FROM hook",
        values: [],
      },
      {
        operation: "hook.list",
        sql: "SELECT id, url, ignored, created_at FROM hook ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        values: [10, 10],
      },
    ]);
  });

  test("uses each mutation operation with placeholders", async () => {
    const executor = new FakeExecutor();
    const repository = new HookRepository(executor);
    expect(
      await repository.create({
        url: "https://example.test/hook",
        ignored: false,
      }),
    ).toBe(42);
    expect(
      await repository.update(7, {
        url: "https://example.test/new",
        ignored: true,
      }),
    ).toBe(true);
    expect(await repository.remove(7)).toBe(true);
    expect(await repository.toggle(7)).toBe(true);
    expect(executor.calls).toEqual([
      {
        operation: "hook.create",
        sql: "INSERT INTO hook (url, ignored) VALUES (?, ?)",
        values: ["https://example.test/hook", 0],
      },
      {
        operation: "hook.update",
        sql: "UPDATE hook SET url = ?, ignored = ? WHERE id = ?",
        values: ["https://example.test/new", 1, 7],
      },
      {
        operation: "hook.remove",
        sql: "DELETE FROM hook WHERE id = ?",
        values: [7],
      },
      {
        operation: "hook.toggle",
        sql: "UPDATE hook SET ignored = 1 - ignored WHERE id = ?",
        values: [7],
      },
    ]);
  });

  test("rejects non-tinyint ignored database values", async () => {
    const executor = new FakeExecutor([
      {
        id: 7,
        url: "https://example.test/hook",
        ignored: 2,
        created_at: new Date(),
      },
    ]);
    await expect(new HookRepository(executor).find(7)).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });
});
