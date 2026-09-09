import { expect, test } from "bun:test";
import {
  allSqlOperationIds,
  allSqlOperationKeys,
  sqlOperations,
} from "../src/infrastructure/mysql/database-session.js";

const statementOwners = [
  "src/infrastructure/mysql/database-session.ts",
  "src/infrastructure/mysql/repositories/activity-repository.ts",
  "src/infrastructure/mysql/repositories/bias-repository.ts",
  "src/infrastructure/mysql/repositories/event-repository.ts",
  "src/infrastructure/mysql/repositories/health-repository.ts",
  "src/infrastructure/mysql/repositories/hook-repository.ts",
  "src/infrastructure/mysql/repositories/ranking-repository.ts",
  "src/infrastructure/mysql/repositories/score-history-repository.ts",
  "src/infrastructure/mysql/repositories/user-repository.ts",
] as const;

test("Given SQL statement owners When checking their operation registry Then every operation is used and unique", async () => {
  const sources = await Promise.all(
    statementOwners.map(async (path) => Bun.file(path).text()),
  );
  const source = sources.join("\n");
  const ids = Object.values(sqlOperations).map((operation) => operation.id);

  expect(allSqlOperationIds.size).toBe(ids.length);
  expect(new Set(ids)).toEqual(allSqlOperationIds);
  expect(allSqlOperationKeys).toHaveLength(ids.length);

  for (const key of allSqlOperationKeys) {
    const operation = sqlOperations[key as keyof typeof sqlOperations];
    expect(
      source.includes(`sqlOperations.${key}`) ||
        source.includes(`"${operation.id}"`),
    ).toBe(true);
  }
});
