import { z } from "zod";
import type { DatabaseExecutor } from "../database-session.js";
import { defineSqlOperation, sqlOperations } from "../database-session.js";

const hookRowSchema = z.object({
  id: z.number().int().positive(),
  url: z.string(),
  ignored: z.union([z.literal(0), z.literal(1)]),
  created_at: z.date(),
});
const countRowSchema = z.object({
  total: z.coerce.number().int().nonnegative(),
});
const hookOperations = {
  count: sqlOperations.hookCount,
  list: sqlOperations.hookList,
  find: sqlOperations.hookFind,
  create: sqlOperations.hookCreate,
  update: sqlOperations.hookUpdate,
  remove: sqlOperations.hookRemove,
  toggle: sqlOperations.hookToggle,
  listActive: defineSqlOperation("hook.list_active"),
  disableFailed: defineSqlOperation("hook.disable_failed"),
} as const;

export type HookDto = Readonly<{
  readonly id: number;
  readonly url: string;
  readonly ignored: boolean;
  readonly created_at: string;
}>;
export type HookCreate = Readonly<{
  readonly url: string;
  readonly ignored: boolean;
}>;
export type HookPatch = Readonly<{
  readonly url?: string;
  readonly ignored?: boolean;
}>;
export type HookPagination = Readonly<{
  readonly page: number;
  readonly limit: number;
}>;
export type HookList = Readonly<{
  readonly items: readonly HookDto[];
  readonly total: number;
}>;

function toDto(row: z.output<typeof hookRowSchema>): HookDto {
  return {
    id: row.id,
    url: row.url,
    ignored: row.ignored === 1,
    created_at: row.created_at.toISOString(),
  };
}

export class HookRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async list(pagination: HookPagination): Promise<HookList> {
    const total =
      (
        await this.database.selectOne(
          hookOperations.count,
          "SELECT COUNT(*) AS total FROM hook",
          [],
          countRowSchema,
        )
      )?.total ?? 0;
    const offset = (pagination.page - 1) * pagination.limit;
    const rows = await this.database.select(
      hookOperations.list,
      "SELECT id, url, ignored, created_at FROM hook ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
      [pagination.limit, offset],
      hookRowSchema,
    );
    return { items: rows.map(toDto), total };
  }

  listActive() {
    return this.database.select(
      hookOperations.listActive,
      "SELECT id,url FROM hook WHERE ignored=0 ORDER BY id",
      [],
      hookRowSchema.pick({ id: true, url: true }),
    );
  }

  async disableFailed(id: number, url: string): Promise<void> {
    await this.database.execute(
      hookOperations.disableFailed,
      "UPDATE hook SET ignored=1 WHERE id=? AND url=?",
      [id, url],
    );
  }

  async find(id: number): Promise<HookDto | undefined> {
    const row = await this.database.selectOne(
      hookOperations.find,
      "SELECT id, url, ignored, created_at FROM hook WHERE id = ?",
      [id],
      hookRowSchema,
    );
    return row ? toDto(row) : undefined;
  }

  async create(input: HookCreate): Promise<number> {
    return (
      await this.database.execute(
        hookOperations.create,
        "INSERT INTO hook (url, ignored) VALUES (?, ?)",
        [input.url, Number(input.ignored)],
      )
    ).insertId;
  }

  async update(id: number, patch: HookPatch): Promise<boolean> {
    const assignments: string[] = [];
    const values: (string | number)[] = [];
    if (patch.url !== undefined) {
      assignments.push("url = ?");
      values.push(patch.url);
    }
    if (patch.ignored !== undefined) {
      assignments.push("ignored = ?");
      values.push(Number(patch.ignored));
    }
    const result = await this.database.execute(
      hookOperations.update,
      `UPDATE hook SET ${assignments.join(", ")} WHERE id = ?`,
      [...values, id],
    );
    return result.affectedRows === 1;
  }

  async remove(id: number): Promise<boolean> {
    return (
      (
        await this.database.execute(
          hookOperations.remove,
          "DELETE FROM hook WHERE id = ?",
          [id],
        )
      ).affectedRows === 1
    );
  }

  async toggle(id: number): Promise<boolean> {
    return (
      (
        await this.database.execute(
          hookOperations.toggle,
          "UPDATE hook SET ignored = 1 - ignored WHERE id = ?",
          [id],
        )
      ).affectedRows === 1
    );
  }
}
