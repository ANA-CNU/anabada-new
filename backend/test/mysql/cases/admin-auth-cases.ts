import { expect } from "bun:test";
import type { MysqlTestContext } from "../context.js";

type ProtectedRequest = Readonly<{
  readonly method: string;
  readonly path: string;
  readonly body?: object;
}>;

const eventInput = {
  title: "인증 확인",
  desc: null,
  begin: "2026-09-10 09:00:00",
  end: "2026-09-11 09:00:00",
  problems: [1000],
};
const scoreRecord = {
  user_id: 1,
  bias: 1,
  desc: null,
  event_id: null,
  problem_id: null,
};
const biasPeriod = {
  begin: "2026-09-01 09:00:00",
  end: "2026-09-02 09:00:00",
};

const protectedRequests: readonly ProtectedRequest[] = [
  { method: "GET", path: "/api/hooks" },
  { method: "GET", path: "/api/hooks/701" },
  {
    method: "POST",
    path: "/api/hooks",
    body: { url: "https://test.invalid", ignored: false },
  },
  { method: "PUT", path: "/api/hooks/701", body: { ignored: true } },
  { method: "DELETE", path: "/api/hooks/701" },
  { method: "PATCH", path: "/api/hooks/701/toggle" },
  { method: "POST", path: "/api/event/create", body: eventInput },
  { method: "PUT", path: "/api/events/201", body: eventInput },
  { method: "DELETE", path: "/api/events/201" },
  {
    method: "POST",
    path: "/api/score-history/bulk",
    body: { records: [scoreRecord] },
  },
  { method: "GET", path: "/api/admin/score-history" },
  { method: "PUT", path: "/api/score-history/401", body: { bias: 1 } },
  { method: "DELETE", path: "/api/score-history/401" },
  { method: "POST", path: "/api/bias/date-init", body: biasPeriod },
  { method: "GET", path: "/api/bias/all" },
  { method: "GET", path: "/api/users/all" },
  { method: "PUT", path: "/api/users/1", body: { tier: 12 } },
  { method: "DELETE", path: "/api/users/1" },
];

function request(input: ProtectedRequest): Request {
  return new Request(`http://integration.test${input.path}`, {
    method: input.method,
    headers: input.body ? { "Content-Type": "application/json" } : undefined,
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
}

export async function runAdminAuthenticationCases(
  context: MysqlTestContext,
): Promise<void> {
  await context.seed();
  context.clearIncidents();
  const operationCount = context.observedOperationIds.size;
  for (const input of protectedRequests) {
    const response = await context.handleUnauthenticated(request(input));
    expect(response.status).toBe(401);
  }
  expect(context.observedOperationIds.size).toBe(operationCount);
  expect(context.incidents).toEqual([]);
}
