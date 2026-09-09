import { Calendar, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { SquircleSurface } from "@/components/ui/squircle"
import { URL } from "@/resource/constant"
import { MonthlyDrawPodium } from "./monthly-draw/MonthlyDrawPodium"
import styles from "./monthly-draw/monthly-draw.module.css"

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

type DrawState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly entries: readonly MonthlyDrawEntry[] }
  | { readonly kind: "error" }

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

function parseMonthlyDrawResponse(value: unknown): readonly MonthlyDrawEntry[] | null {
  // API rank는 카드 key와 배치 기준이므로 렌더 전에 함께 검증한다.
  if (!isRecord(value) || value.success !== true || !Array.isArray(value.data) || !value.data.every(isMonthlyDrawEntry)) return null
  const ranks = new Set(value.data.map((entry) => entry.rank))
  if (ranks.size !== value.data.length) return null
  return value.data.map((entry) => ({ displayName: entry.display_name, rank: entry.rank, solved: entry.last_month_solved, score: entry.last_month_score })).sort((left, right) => left.rank - right.rank)
}

function LoadingDraw(): React.JSX.Element {
  return (
    <div className={styles.loadingGrid} aria-label="지난 달 추첨 결과를 불러오는 중">
      {[1, 2, 3].map((rank) => <SquircleSurface className={styles.loadingCard} key={rank} radius="surface" />)}
    </div>
  )
}

function EmptyDraw(): React.JSX.Element {
  return <div className={styles.state}><Calendar aria-hidden="true" className={styles.stateIcon} /><p>아직 추첨 결과가 없습니다.</p><span>최초 추첨 이후 이곳에 결과가 표시됩니다.</span></div>
}

function FailedDraw({ onRetry }: { readonly onRetry: () => void }): React.JSX.Element {
  return <div className={styles.state} role="alert"><p>추첨 결과를 불러오지 못했습니다.</p><button className={styles.retryButton} onClick={onRetry} type="button"><RefreshCw aria-hidden="true" size={15} /> 다시 시도</button></div>
}

export default function LastMonthRanking(): React.JSX.Element {
  const [drawState, setDrawState] = useState<DrawState>({ kind: "loading" })
  const [requestNumber, setRequestNumber] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setDrawState({ kind: "loading" })
    async function loadMonthlyDraw(): Promise<void> {
      try {
        const response = await fetch(`${URL}/api/ranking/selected-month-board`, { signal: controller.signal })
        if (!response.ok) {
          setDrawState({ kind: "error" })
          return
        }
        const entries = parseMonthlyDrawResponse(await response.json())
        setDrawState(entries ? { kind: "ready", entries } : { kind: "error" })
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setDrawState({ kind: "error" })
      }
    }
    void loadMonthlyDraw()
    return () => controller.abort()
  }, [requestNumber])

  return (
    <section className={styles.section} aria-labelledby="monthly-draw-heading">
      <div className={styles.wrap}>
        <header className={styles.header}>
          <h2 id="monthly-draw-heading">지난 달 최종 추첨 결과</h2>
        </header>
        {drawState.kind === "loading" && <LoadingDraw />}
        {drawState.kind === "error" && <FailedDraw onRetry={() => setRequestNumber((current) => current + 1)} />}
        {drawState.kind === "ready" && (drawState.entries.length === 0 ? <EmptyDraw /> : <MonthlyDrawPodium entries={drawState.entries} />)}
        <p className={styles.note}>랭킹은 그 달의 마지막 추첨기록을 기준으로 결정됩니다.</p>
      </div>
    </section>
  )
}
