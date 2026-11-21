import { PublicShell } from "@/components/site/public-shell";
import { aojOrigin, bojContestArchive } from "@/contest/contest-archive";
import { ContestArchiveCards } from "@/contest/ContestArchiveCards";
import { ContestLinkContent } from "@/contest/ContestLinkContent";
import styles from "@/contest/contest-archive.module.css";

export const metadata = {
  title: "대회 아카이브",
  description: "생각하는 프로그래밍 대회, SW-IT Contest, ANAGETDON의 문제와 공식 해설을 만나보세요.",
};

export default function ContestRoute() {
  return (
    <PublicShell>
      <main className={`site-frame ${styles.archive}`}>
        <header className={styles.heading}>
          <h1>대회 아카이브</h1>
          <p>ANA의 대회 문제와 지난 대회 기록을 연도별로 찾아보세요.</p>
        </header>
        <ContestArchiveCards heading="h2" />
        <div className={styles.archiveFooter}>
          <a className="site-text-link" href={`${aojOrigin}/contests`}><ContestLinkContent>AOJ 대회 목록</ContestLinkContent></a>
          <a className="site-text-link" href={bojContestArchive} target="_blank" rel="noopener noreferrer"><ContestLinkContent>백준 대회 아카이브</ContestLinkContent></a>
        </div>
      </main>
    </PublicShell>
  );
}
