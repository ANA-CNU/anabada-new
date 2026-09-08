import { URL } from "@/resource/constant";

export type RankingBoard = {
  readonly id: number;
  readonly title: string | null;
  readonly createdAt: string;
  readonly isActive: boolean;
  readonly memberCount: number;
};

export type RankingBoardMember = {
  readonly rank: number;
  readonly userId: number;
  readonly jungolName: string;
  readonly tier: number;
};

export type RankingBoardDetail = {
  readonly board: RankingBoard;
  readonly members: readonly RankingBoardMember[];
};

export type RankingBoardPage = {
  readonly boards: readonly RankingBoard[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
};

class RankingBoardApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RankingBoardApiError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function integerField(value: Record<string, unknown>, key: string, minimum: number): number | null {
  const field = value[key];
  return typeof field === "number" && Number.isSafeInteger(field) && field >= minimum ? field : null;
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === "string" ? field : null;
}

function booleanField(value: Record<string, unknown>, key: string): boolean | null {
  const field = value[key];
  return typeof field === "boolean" ? field : null;
}

function parseBoard(value: unknown): RankingBoard | null {
  if (!isRecord(value)) return null;
  const id = integerField(value, "id", 1);
  const createdAt = stringField(value, "created_at");
  const isActive = booleanField(value, "is_active");
  const memberCount = integerField(value, "member_count", 0);
  const titleValue = value.title;
  if (titleValue !== null && typeof titleValue !== "string") return null;
  const title = titleValue;

  if (id === null || createdAt === null || Number.isNaN(new Date(createdAt).getTime()) || isActive === null || memberCount === null) return null;
  return { id, title, createdAt, isActive, memberCount };
}

function parseMember(value: unknown): RankingBoardMember | null {
  if (!isRecord(value)) return null;
  const rank = integerField(value, "rank", 1);
  const userId = integerField(value, "user_id", 1);
  const jungolName = stringField(value, "jungol_name");
  const tier = integerField(value, "tier", 0);
  if (rank === null || userId === null || jungolName === null || tier === null || tier > 31) return null;
  return { rank, userId, jungolName, tier };
}

function failureMessage(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  const message = stringField(value, "message");
  return message ?? fallback;
}

async function parseResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${URL}${path}`, { ...init, credentials: "include", signal });
  const body = await parseResponse(response);
  if (!response.ok) throw new RankingBoardApiError(response.status, failureMessage(body, "요청을 처리하지 못했습니다."));
  if (!isRecord(body) || body.success !== true) throw new RankingBoardApiError(response.status, failureMessage(body, "요청을 처리하지 못했습니다."));
  return body;
}

export async function getRankingBoards(page: number, signal?: AbortSignal): Promise<RankingBoardPage> {
  const body = await request(`/api/admin/ranking-boards?page=${page}&limit=10`, { method: "GET" }, signal);
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(body.pagination)) {
    throw new RankingBoardApiError(200, "추첨 보드 목록 응답이 올바르지 않습니다.");
  }
  const boards = body.data.map(parseBoard);
  const pageValue = integerField(body.pagination, "page", 1);
  const limit = integerField(body.pagination, "limit", 1);
  const total = integerField(body.pagination, "total", 0);
  const totalPages = integerField(body.pagination, "total_pages", 0);
  if (boards.some((board) => board === null) || pageValue === null || limit === null || total === null || totalPages === null) {
    throw new RankingBoardApiError(200, "추첨 보드 목록 응답이 올바르지 않습니다.");
  }
  return { boards: boards.filter((board): board is RankingBoard => board !== null), page: pageValue, limit, total, totalPages };
}

export async function getRankingBoardDetail(id: number, signal?: AbortSignal): Promise<RankingBoardDetail> {
  const body = await request(`/api/admin/ranking-boards/${id}`, { method: "GET" }, signal);
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.members)) {
    throw new RankingBoardApiError(200, "추첨 보드 상세 응답이 올바르지 않습니다.");
  }
  const board = parseBoard(body.data.board);
  const members = body.data.members.map(parseMember);
  if (board === null || members.some((member) => member === null)) {
    throw new RankingBoardApiError(200, "추첨 보드 상세 응답이 올바르지 않습니다.");
  }
  return { board, members: members.filter((member): member is RankingBoardMember => member !== null).sort((first, second) => first.rank - second.rank) };
}

export async function setRankingBoardActive(id: number, isActive: boolean): Promise<void> {
  await request(`/api/admin/ranking-boards/${id}/active`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: isActive }),
  });
}
