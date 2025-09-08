import React from "react";

type ContestHeroProps = {
  onApplyHref?: string;
};

const ContestHero: React.FC<ContestHeroProps> = ({ onApplyHref = "https://forms.gle/rsReeLGpgHWntZtv8" }) => {
  return (
    <section className="mb-8">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(1200px_500px_at_-10%_-20%,rgba(255,255,255,0.08),transparent_60%),radial-gradient(900px_400px_at_110%_10%,rgba(255,255,255,0.06),transparent_60%)] mt-10 px-5 py-8 md:px-8 md:py-12">
        {/* accent badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-sm text-white/80 backdrop-blur">
          2025 스위트콘
        </div>

        {/* title */}
        <h1 className="mt-4 text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
          <span className="bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent">
            SW-IT Contest
          </span>
        </h1>

        {/* subtitle */}
        <p className="mt-4 max-w-3xl text-white/80 text-base md:text-lg">
          충남대학교 컴퓨터융합학부 동아리 ANA에서 주최하는 프로그래밍 대회입니다. 팀원들과 함께 문제를 풀고 상금을 노려보세요!
        </p>

        {/* CTA */}
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <a
            href={onApplyHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400/95 hover:bg-amber-400 text-black font-semibold px-6 py-3 text-base md:text-lg shadow-[0_8px_24px_rgba(251,191,36,0.25)] transition-colors"
          >
            참가 신청하기
          </a>
          <span className="text-white/60 text-sm">9월 19일까지 접수</span>
        </div>

        {/* glow accents */}
        <div className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="pointer-events-none absolute right-0 -bottom-6 h-64 w-64 rounded-full bg-orange-400/10 blur-3xl" />
      </div>
    </section>
  );
};

export default ContestHero;


