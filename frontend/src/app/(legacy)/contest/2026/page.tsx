import Link from "next/link";
import { PublicShell } from "@/components/site/public-shell";
import { ContestLinkContent } from "@/contest/ContestLinkContent";
import styles from "@/contest/contest-archive.module.css";

export const metadata = {
  title: "2026 SW-IT Contest",
  description: "2026 SW-IT Contest의 14개 문제와 공식 에디토리얼을 확인하세요.",
};

const problems = [
  ["A", "스위트팝콘", "Easy"],
  ["B", "색각 보정", "Easy"],
  ["C", "조각난 사진", "Medium"],
  ["D", "돌탑 쌓기", "Medium"],
  ["E", "바보외판원", "Medium"],
  ["F", "암호화 통신", "Medium"],
  ["G", "스위트콘 찾기", "Medium"],
  ["H", "중심격자점", "Medium"],
  ["I", "제곱수의 합", "Hard"],
  ["J", "소수 클러스터", "Hard"],
  ["K", "해저 탐사", "Hard"],
  ["L", "물류회사", "Hard"],
  ["M", "순환소수", "Challenge"],
  ["N", "마법의 옥수수", "Challenge"],
] as const;

export default function Contest2026Route() {
  return (
    <PublicShell>
      <main className={`site-frame ${styles.archive}`}>
        <Link className="site-text-link" href="/contest"><ContestLinkContent icon="back">대회 아카이브</ContestLinkContent></Link>
        <header className={styles.detailHero}>
          <p className={styles.eyebrow}>ANA · 대회 종료</p>
          <h1><span>2026</span>SW-IT Contest</h1>
          <p>참여해 주신 모든 분들께 감사드립니다.<br />대회에서 만난 14개 문제를 다시 풀고, 공식 해설로 풀이를 넓혀보세요.</p>
          <div className={styles.detailActions}>
            <a href="https://aoj.anacnu.kr/sources/408" target="_blank" rel="noopener noreferrer"><ContestLinkContent size={18}>2026 문제 풀어보기</ContestLinkContent></a>
            <a href="/swit-2026-editorial.pdf" target="_blank" rel="noopener noreferrer"><ContestLinkContent size={18}>공식 해설 PDF</ContestLinkContent></a>
          </div>
        </header>
        <section className={styles.problems} aria-labelledby="problem-list-title">
          <h2 id="problem-list-title">2026 출제 문제</h2>
          <p>공식 에디토리얼에 수록된 문제와 출제진이 의도한 난이도입니다.</p>
          <ol className={styles.problemList}>
            {problems.map(([id, title, difficulty]) => <li key={id}><span>{id}</span><strong>{title}</strong><small>{difficulty}</small></li>)}
          </ol>
        </section>
        <div className={styles.archiveFooter}>
          <p>지난해의 문제도 만나보세요.</p>
          <Link className="site-text-link" href="/contest/2025"><ContestLinkContent>2025 SW-IT Contest</ContestLinkContent></Link>
        </div>
      </main>
    </PublicShell>
  );
}
