import "server-only";
import { backendJson } from "@/server/backend";
import { parseUpdateTime, type UpdateTime } from "./update-time";
import {
  rankingResponse, recentScoreResponse, recentProblemResponse, monthlyResponse,
  userResponse, scoreSchema, problemsSchema, ranksSchema, summaryResponse,
} from "./api-schemas";

export async function loadDashboard() {
  const [ranking, scores, recent, monthly, initialUpdateTime] = await Promise.all([
    backendJson<unknown>("/api/v2/ranking/bias").then(value => rankingResponse.parse(value)),
    backendJson<unknown>("/api/statistics/recently-score?page=1&limit=10").then(value => recentScoreResponse.parse(value)),
    backendJson<unknown>("/api/statistics/recently-solved").then(value => recentProblemResponse.parse(value)),
    backendJson<unknown>("/api/ranking/monthly-solved").then(value => monthlyResponse.parse(value)),
    backendJson<unknown>("/api/board/recently-date")
      .then(value => parseUpdateTime(value, Date.now()))
      .catch((): UpdateTime => ({ kind: "error" })),
  ]);
  return {
    initialRanking: ranking.data,
    initialUpdateTime,
    initialActivity: {
      capturedAt: Date.now(),
      scores: scores.data.map((entry, index) => ({ id: `1-${index}-${entry.id}-${entry.created_at}`, user: entry.display_name, reason: entry.desc ?? "", score: entry.bias, time: entry.created_at })),
      recent: recent.data.map((entry, index) => ({ id: String(index + 1), user: entry.display_name, problemNumber: entry.problem, solvedAt: entry.submitted_at })),
      monthly: monthly.data.map((entry, index) => ({ id: String(index + 1), user: entry.display_name, problemCount: entry.solved, totalSolved: entry.total_solved })),
    },
  };
}

function fulfilled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

export async function loadProfile(id: string) {
  const profile = userResponse.parse(await backendJson<unknown>(`/api/users/${encodeURIComponent(id)}`));
  const userId = profile.data.id;
  const [scores, problems, ranks, monthly] = await Promise.allSettled([
    backendJson<unknown>(`/api/score_history/user/${userId}`).then(value => scoreSchema.array().parse(value)),
    backendJson<unknown>(`/api/user/${userId}/problems`).then(value => problemsSchema.parse(value)),
    backendJson<unknown>(`/api/board/user/${userId}/rank-history`).then(value => ranksSchema.parse(value)),
    backendJson<unknown>(`/api/user/${userId}/monthly-summary`).then(value => summaryResponse.parse(value).data),
  ]);
  return {
    initialUser: profile.data,
    initialActivity: { scores: fulfilled(scores), problems: fulfilled(problems), ranks: fulfilled(ranks), monthly: fulfilled(monthly) },
  };
}
