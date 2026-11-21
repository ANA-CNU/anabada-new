import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { SquircleSurface } from "@/components/ui/squircle";
import { PublicShell } from "@/components/site/public-shell";
import { ContestArchiveCards } from "@/contest/ContestArchiveCards";
import { ContestLinkContent } from "@/contest/ContestLinkContent";
import ActivitySection from "@/home/components/ActivitySection";
import EventSection from "@/home/components/EventSection";
import LastMonthRanking from "@/home/components/LastMonthRanking";
import { parseMonthlyDrawResponse } from "@/home/components/monthly-draw/data";
import UnifiedRankList from "@/home/components/UnifiedRankList";
import { loadDashboard } from "@/home/server-data";
import StatsSection from "@/home/stats/StatsSection";
import { backendJson } from "@/server/backend";
import { listPosts } from "@/server/board/repository";
import { BoardPostCards } from "./board/BoardPostCards";
import CoverDotGrid from "./CoverDotGrid";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

const eventResponse = z.object({ data: z.array(z.object({
  event_title: z.string(), startDate: z.string(), endDate: z.string(), problems: z.string().nullable(),
})) });

async function loadEvents() {
  try {
    const [ongoing, past] = await Promise.all([
      backendJson("/api/events/ongoing").then((body) => eventResponse.parse(body).data),
      backendJson("/api/events/past").then((body) => eventResponse.parse(body).data),
    ]);
    return { ongoing, past, capturedAt: Date.now() };
  } catch {
    return undefined;
  }
}

const totalResponse = z.object({ data: z.object({ total_problems: z.number().int().nonnegative() }) });

export default async function HomePage() {
  const [data, draw, total, events, posts] = await Promise.all([
    loadDashboard(),
    backendJson("/api/ranking/selected-month-board").then(parseMonthlyDrawResponse).catch(() => null),
    backendJson("/api/statistics/total-problems").then((body) => totalResponse.parse(body).data.total_problems).catch(() => undefined),
    loadEvents(),
    listPosts(1).then(({ posts }) => posts.slice(0, 3)).catch(() => null),
  ]);

  return (
    <PublicShell>
      <main className={`site-frame ${styles.main}`}>
        <div className={styles.opening}>
          <SquircleSurface asChild radius="hero">
            <section className={styles.cover} aria-labelledby="home-title">
              <CoverDotGrid />
              <div className={styles.coverTitle}>
                <h1 id="home-title">ANABADA.</h1>
                <p>충남대학교 ANA 알고리즘 커뮤니티</p>
              </div>
            </section>
          </SquircleSurface>
          <section className={styles.ranking} aria-label="월간 랭킹">
            <UnifiedRankList ranking={data.initialRanking} initialUpdateTime={data.initialUpdateTime} />
          </section>
        </div>

        <div className={styles.draw}>
          <LastMonthRanking initialEntries={draw} />
        </div>

        <section className={styles.section} aria-labelledby="contests-title">
          <header className={styles.sectionHeading}>
            <h2 id="contests-title">대회</h2>
            <Link className="site-text-link" href="/contest"><ContestLinkContent>대회 모두 보기</ContestLinkContent></Link>
          </header>
          <ContestArchiveCards />
        </section>

        <div className={styles.legacySection}><ActivitySection initialActivity={data.initialActivity} /></div>
        <div className={styles.legacySection}><StatsSection initialTotal={total} /></div>
        <div className={styles.legacySection}><EventSection initialEvents={events} /></div>

        <section className={styles.section} aria-labelledby="posts-title">
          <header className={styles.sectionHeading}>
            <h2 id="posts-title">최신 글</h2>
            <Link className="site-text-link" href="/board">블로그 모두 보기 <ArrowUpRight aria-hidden="true" size={17} /></Link>
          </header>
          {posts?.length ? <BoardPostCards posts={posts} variant="home" /> : (
            <div className={styles.empty}>
              <p>{posts ? "아직 게시글이 없습니다." : "게시글을 불러오지 못했습니다."}</p>
              {posts && <Link className="site-text-link" href="/board/new">첫 글 남기기 <ArrowUpRight aria-hidden="true" size={16} /></Link>}
            </div>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
