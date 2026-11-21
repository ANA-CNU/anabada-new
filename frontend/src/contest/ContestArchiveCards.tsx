import { SquircleSurface } from "@/components/ui/squircle";
import { contestSeries } from "./contest-archive";
import { ContestLinkContent } from "./ContestLinkContent";
import styles from "./contest-archive.module.css";

export function ContestArchiveCards({ heading: Heading = "h3" }: { readonly heading?: "h2" | "h3" }) {
  return (
    <div className={styles.cards}>
      {contestSeries.map((series) => {
        const titleId = `contest-series-${series.id}`;
        return (
          <section key={series.id} aria-labelledby={titleId} className={styles.series}>
            <SquircleSurface asChild radius="surface">
              <header className={`${styles.seriesCover} ${styles[series.tone]}`}>
                <Heading id={titleId}>{series.name}</Heading>
                <p>{series.description}</p>
              </header>
            </SquircleSurface>
            <ul className={styles.editions}>
              {series.editions.map((edition) => {
                const editionName = `${edition.label} ${series.name}`;
                return (
                  <li className={styles.edition} key={edition.label}>
                    <span className={styles.editionLabel}>{edition.label}</span>
                    <div className={styles.editionActions}>
                      {edition.links.map(({ href, label, judge }) => (
                        <a key={href} href={href} aria-label={`${editionName} ${label} (${judge})`}>
                          <ContestLinkContent size={14}>{label}</ContestLinkContent>
                        </a>
                      ))}
                      {edition.editorial && (
                        <a href={edition.editorial} target="_blank" rel="noopener noreferrer" aria-label={`${editionName} 공식 해설 PDF (새 탭)`}>
                          <ContestLinkContent icon="editorial" size={14}>해설</ContestLinkContent>
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
