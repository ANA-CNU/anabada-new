import Link from "next/link";
import { ContestLinkContent } from "@/contest/ContestLinkContent";
import ContestPage from "@/contest/ContestPage";
import styles from "@/contest/contest-archive.module.css";

export const metadata = {
  title: "2025 SW-IT Contest",
  description: "2025 SW-IT Contest 당시 대회 안내와 9개 문제의 공식 해설입니다.",
};

export default function Contest2025Route() {
  return (
    <main>
      <div className="public-site" style={{ minHeight: "auto" }}>
        <aside className={`site-frame ${styles.historic}`} aria-label="지난 대회 안내">
          <div>
            <Link className="site-text-link" href="/contest"><ContestLinkContent icon="back">대회 아카이브</ContestLinkContent></Link>
            <p>2025년 대회가 종료되었습니다. 아래는 당시 안내이며, 참가 접수는 마감되었습니다.</p>
          </div>
          <a className="site-text-link" href="/2025_SW-IT-Contest_edi.pdf" target="_blank" rel="noopener noreferrer"><ContestLinkContent>2025 공식 해설 PDF</ContestLinkContent></a>
        </aside>
      </div>
      <ContestPage />
    </main>
  );
}
