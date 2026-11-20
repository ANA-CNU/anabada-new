import type { User } from "@/types";

async function readAdminData(
  endpoint: string,
  signal: AbortSignal,
  request: typeof fetch,
) {
  const response = await request(endpoint, { credentials: "include", signal });
  if (!response.ok) throw new Error(`관리자 데이터 요청 실패 (${response.status})`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("success" in payload) || payload.success !== true) {
    throw new Error("관리자 데이터 요청 실패");
  }
  return payload;
}

export async function loadAdminUsers(
  baseUrl: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<User[]> {
  const payload = await readAdminData(`${baseUrl}/api/users/all`, signal, request);
  if (!("data" in payload) || !Array.isArray(payload.data)) {
    throw new Error("유저 목록 응답이 올바르지 않습니다.");
  }
  return payload.data;
}

export async function loadActiveEventCount(
  baseUrl: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<number> {
  const payload = await readAdminData(`${baseUrl}/api/events?status=active&limit=1`, signal, request);
  const pagination = "pagination" in payload ? payload.pagination : null;
  const total = pagination && typeof pagination === "object" && "total" in pagination ? pagination.total : null;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
    throw new Error("이벤트 개수 응답이 올바르지 않습니다.");
  }
  return total;
}
