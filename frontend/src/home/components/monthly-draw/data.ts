export type MonthlyDrawEntry = {
  readonly displayName: string
  readonly rank: number
  readonly solved: number
  readonly score: number
}

type MonthlyDrawApiEntry = {
  readonly display_name: string
  readonly rank: number
  readonly last_month_solved: number
  readonly last_month_score: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isMonthlyDrawEntry(value: unknown): value is MonthlyDrawApiEntry {
  return isRecord(value)
    && typeof value.display_name === "string"
    && typeof value.rank === "number"
    && Number.isInteger(value.rank)
    && value.rank >= 1
    && value.rank <= 7
    && typeof value.last_month_solved === "number"
    && Number.isInteger(value.last_month_solved)
    && value.last_month_solved >= 0
    && typeof value.last_month_score === "number"
    && Number.isFinite(value.last_month_score)
}

export function parseMonthlyDrawResponse(value: unknown): readonly MonthlyDrawEntry[] | null {
  // API rank는 카드 key와 배치 기준이므로 렌더 전에 함께 검증한다.
  if (!isRecord(value) || value.success !== true || !Array.isArray(value.data) || !value.data.every(isMonthlyDrawEntry)) return null
  const ranks = new Set(value.data.map((entry) => entry.rank))
  if (ranks.size !== value.data.length) return null
  return value.data.map((entry) => ({ displayName: entry.display_name, rank: entry.rank, solved: entry.last_month_solved, score: entry.last_month_score })).sort((left, right) => left.rank - right.rank)
}
