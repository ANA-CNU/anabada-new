import { z } from "zod";
import type { DatabaseExecutor } from "../database-session.js";
import { sqlOperations } from "../database-session.js";
import { type UserDto, type UserPatch, userDtoSchema } from "./contracts.js";

export type UserHandleColumn = "handle" | "jungol_name";
const idSchema = z.object({ id: z.number().int().positive() });
const userOperations = {
  list: sqlOperations.userList,
  find: sqlOperations.userFind,
  search: sqlOperations.userSearch,
  exists: sqlOperations.userExists,
  update: sqlOperations.userUpdate,
  remove: sqlOperations.userRemove,
} as const;
const writableColumns = [
  "jungol_name",
  "corrects",
  "submissions",
  "solution",
  "korean_name",
  "tier",
  "ignored",
  "jungol_account_id",
  "rank_wrong_count",
] as const;
type WritableColumn = (typeof writableColumns)[number];

export class UserRepository {
  constructor(
    private readonly database: DatabaseExecutor,
    private readonly handleColumn: UserHandleColumn = "jungol_name",
  ) {}

  private get userColumns(): string {
    const legacyFields =
      this.handleColumn === "handle"
        ? "'0' AS jungol_account_id, 0 AS rank_wrong_count"
        : "CAST(jungol_account_id AS CHAR) AS jungol_account_id, rank_wrong_count";
    return `id, ${this.handleColumn} AS jungol_name, korean_name, corrects, submissions, CAST(solution AS CHAR) AS solution, tier, ignored, ${legacyFields}`;
  }

  async list(): Promise<readonly UserDto[]> {
    return this.database.select(
      userOperations.list,
      `SELECT ${this.userColumns} FROM user ORDER BY id ASC`,
      [],
      userDtoSchema,
    );
  }

  async find(id: number): Promise<UserDto | undefined> {
    return this.database.selectOne(
      userOperations.find,
      `SELECT ${this.userColumns} FROM user WHERE id = ?`,
      [id],
      userDtoSchema,
    );
  }

  async search(term: string): Promise<readonly UserDto[]> {
    const escaped = term
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_");
    const pattern = `%${escaped}%`;
    return this.database.select(
      userOperations.search,
      `SELECT ${this.userColumns} FROM user WHERE ignored = 0 AND (${this.handleColumn} LIKE ? ESCAPE '\\\\' OR korean_name LIKE ? ESCAPE '\\\\') ORDER BY tier DESC, corrects DESC LIMIT 50`,
      [pattern, pattern],
      userDtoSchema,
    );
  }

  async update(id: number, patch: UserPatch): Promise<boolean> {
    const keys = writableColumns.filter(
      (key): key is WritableColumn => key in patch,
    );
    const assignments = keys
      .map((key) => `${key === "jungol_name" ? this.handleColumn : key} = ?`)
      .join(", ");
    const values = keys.map((key) =>
      key === "ignored" ? Number(patch[key]) : patch[key],
    );
    const result = await this.database.execute(
      userOperations.update,
      `UPDATE user SET ${assignments} WHERE id = ?`,
      [...values, id],
    );
    return result.affectedRows === 1;
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.database.execute(
      userOperations.remove,
      "DELETE FROM user WHERE id = ?",
      [id],
    );
    return result.affectedRows === 1;
  }

  async exists(id: number): Promise<boolean> {
    return (
      (await this.database.selectOne(
        userOperations.exists,
        "SELECT id FROM user WHERE id = ?",
        [id],
        idSchema,
      )) !== undefined
    );
  }
}
