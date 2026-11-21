"use client";

import { Triangle } from "lucide-react";
import { SquircleSurface } from "@/components/ui/squircle";
import { useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import LastUpdateTime from "./LastUpdateTime";
import type { UpdateTime } from "../update-time";
import type { LatestBiasRanking } from "@/types";

const trophyByRank: Record<number, { src: string; alt: string; fallback: string }> = {
  1: { src: "/gold_tropy.png", alt: "gold", fallback: "🥇" },
  2: { src: "/silver_tropy.png", alt: "silver", fallback: "🥈" },
  3: { src: "/bronze_tropy.png", alt: "bronze", fallback: "🥉" },
};

const rowBaseClass =
  "flex items-center justify-between w-full px-5 mb-3 py-4 bg-white/5 border border-white/10";

const highlightFirstClass =
  "bg-gradient-to-r from-amber-400/25 via-amber-200/15 to-white/5 outline outline-1 outline-amber-300/30 outline-offset-0";
const highlightSecondClass =
  "bg-gradient-to-r from-gray-200/25 via-gray-100/15 to-white/5 outline outline-1 outline-gray-300/30 outline-offset-0";
const highlightThirdClass =
  "bg-gradient-to-r from-orange-400/25 via-orange-300/15 to-white/5 outline outline-1 outline-orange-300/30 outline-offset-0";

export default function UnifiedRankList({ ranking, initialUpdateTime }: {
  readonly ranking: readonly LatestBiasRanking[];
  readonly initialUpdateTime: UpdateTime;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduceMotion = useReducedMotion();
  const [failedTrophyImages, setFailedTrophyImages] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (reduceMotion || ranking.length === 0) return;
    const animation = animate(
      "[data-ranking-card]",
      { opacity: [0.68, 1, 1], y: [18, -2, 0] },
      { duration: 0.62, ease: "easeOut", times: [0, 0.78, 1], delay: (index) => Math.min(index * 0.055, 0.33) },
    );
    return () => animation.complete();
  }, [animate, ranking, reduceMotion]);

  return (
    <div
      ref={scope}
      className="w-full max-w-[680px] lg:max-w-[560px] px-3 max-h-[600px] overflow-y-auto unified-scroll"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', zIndex: 3 }}
    >
      <style>{`
        .unified-scroll::-webkit-scrollbar { 
          width: 0 !important; 
          height: 0 !important; 
          display: none !important; 
          background: transparent !important;
        }
        .unified-scroll { 
          -ms-overflow-style: none; 
          scrollbar-width: none; 
          -webkit-overflow-scrolling: touch;
        }
      `}</style>

      <LastUpdateTime initialUpdateTime={initialUpdateTime} />

      {ranking.map((u) => {
        const isTop = u.rank <= 3;
        const trophy = trophyByRank[u.rank];
        const highlightClass = u.rank === 1
          ? highlightFirstClass
          : u.rank === 2
          ? highlightSecondClass
          : u.rank === 3
          ? highlightThirdClass
          : "";
        const rowClass = isTop
          ? `flex items-center justify-between w-full px-4 mb-3 py-4 ${highlightClass} box-border overflow-visible`
          : `${rowBaseClass} ${highlightClass}`;
        const delta = u.delta ?? 0;
        const deltaBadge = delta === 0 ? (
          <span className="text-gray-300">-</span>
        ) : (
          <span className={`inline-flex items-center gap-1 ${delta < 0 ? "text-rose-400" : "text-emerald-400"}`}>
            <Triangle
              role="img"
              aria-label={delta < 0 ? "하락" : "상승"}
              size={8}
              fill="currentColor"
              strokeWidth={0}
              className={delta < 0 ? "shrink-0 rotate-180" : "shrink-0"}
            />
            {Math.abs(delta)}
          </span>
        );
        const leftSlotClass = isTop
          ? "w-12 h-12 flex items-center justify-center"
          : "w-6 text-white/90 text-base tabular-nums text-center";
        const trophyImgClass = isTop ? "w-10 h-10 object-contain" : "w-6 h-6 object-contain";
        const trophyEmojiClass = isTop ? "text-3xl" : "text-xl";

        return (
          <div key={u.jungol_name} data-ranking-card>
            <SquircleSurface className={rowClass}>
            {/* Left - Rank & Trophy & Username */}
            <div className="flex items-center gap-4 min-w-0">
              <div className={leftSlotClass}>
                {isTop ? (
                  (!failedTrophyImages[u.rank] && trophy) ? (
                    <img
                      src={trophy.src}
                      alt={trophy.alt}
                      className={trophyImgClass}
                      onError={() => setFailedTrophyImages((previous) => ({ ...previous, [u.rank]: true }))}
                    />
                  ) : (
                    <span className={trophyEmojiClass}>
                      {trophy?.fallback || ""}
                    </span>
                  )
                ) : (
                  <span>{u.rank}</span>
                )}
              </div>

              <div className="min-w-0">
                <span 
                  className="text-white font-semibold truncate block"
                >
                  {u.display_name}
                </span>
                <div className="text-xs text-white/60 flex items-center gap-2">
                  <span>티어: {u.tier}</span>
                  <span className="text-white/20">|</span>
                  <span className="inline-flex items-center gap-1">순위 변화: {deltaBadge}</span>
                </div>
              </div>
            </div>

            {/* Right - Stats */}
            <div className="flex items-center gap-4">
              {/* 모바일: 숨김, 데스크톱: 문제 수 표시 */}
              <div className="hidden sm:block text-sm text-white/90">
                <span className="font-semibold">{u.bias}</span>
                <span className="ml-1 text-white/70">BIA</span>
              </div>
              {/* 모바일: 점수만, 데스크톱: 모든 정보 */}
              <div className="text-xs text-white/70">
                <span className="sm:hidden text-base font-bold text-white/90">{u.bias} BIA</span>
                <span className="hidden sm:inline">월간 풀이: {u.monthly_problem}</span>
                <span className="hidden sm:inline mx-2 text-white/20">|</span>
                <span className="hidden sm:inline">누적 풀이: {u.total_problem}</span>
              </div>
            </div>
            </SquircleSurface>
          </div>
        
        );
      })}
    </div>
  );
}
