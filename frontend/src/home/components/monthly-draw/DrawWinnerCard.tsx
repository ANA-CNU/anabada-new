import { SquircleSurface } from "@/components/ui/squircle"
import type { MonthlyDrawEntry } from "../LastMonthRanking"
import styles from "./monthly-draw.module.css"

type DrawWinnerCardProps = {
  readonly entry: MonthlyDrawEntry
  readonly variant: "podium" | "compact"
}

export function DrawWinnerCard({ entry, variant }: DrawWinnerCardProps): React.JSX.Element {
  const podium = variant === "podium"
  const className = `${styles.card} ${podium ? styles.podiumCard : styles.compactCard} ${styles[`rank${entry.rank}`] ?? ""}`

  return (
    <SquircleSurface asChild radius="surface">
      <article className={className}>
        {podium && <img alt="" className={styles.crown} height={entry.rank === 1 ? 78 : 66} src="/images/monthly-draw/crown-gold.png" width={entry.rank === 1 ? 78 : 66} />}
        <p className={styles.rank}>{entry.rank}등</p>
        {podium && <div className={styles.rule} />}
        <h3 className={styles.name}>{entry.displayName}</h3>
        <dl className={styles.stats}>
          <div><dt>문제</dt><dd className={styles.count}>{entry.solved}개</dd></div>
          <div><dt>점수</dt><dd className={styles.score}>{entry.score}</dd></div>
        </dl>
      </article>
    </SquircleSurface>
  )
}
