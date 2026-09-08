import type { MonthlyDrawEntry } from "../LastMonthRanking"
import { DrawWinnerCard } from "./DrawWinnerCard"
import styles from "./monthly-draw.module.css"

type MonthlyDrawPodiumProps = {
  readonly entries: readonly MonthlyDrawEntry[]
}

export function MonthlyDrawPodium({ entries }: MonthlyDrawPodiumProps): React.JSX.Element {
  const podium = entries.filter((entry) => entry.rank <= 3)
  const others = entries.filter((entry) => entry.rank >= 4)

  // DOM은 rank 1→2→3을 유지하고 CSS가 desktop의 시각 순서만 바꾼다.
  return (
    <>
      {podium.length > 0 && (
        <section aria-label="상위 세 명 추첨 결과" className={styles.podium}>
          {podium.map((entry) => <DrawWinnerCard entry={entry} key={entry.rank} variant="podium" />)}
        </section>
      )}
      {others.length > 0 && (
        <section aria-label="그 외 추첨 결과" className={styles.others}>
          {others.map((entry) => <DrawWinnerCard entry={entry} key={entry.rank} variant="compact" />)}
        </section>
      )}
    </>
  )
}
