import { URL } from "@/resource/constant";
import React, { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Spool, Spotlight } from "lucide-react";
import SpotlightCard from "@/react_bits/SpotlightCard/SpotlightCard";

// API 응답 타입 (/api/v2/ranking/bias)
interface RankingItemV2 {
  username: string;
  tier: number;
  rank: number;
  delta: number;
  total_problem: number;
  bias: number;
  monthly_problem: number;
}

interface ApiV2Response {
  success: boolean;
  data: RankingItemV2[];
  message?: string;
}

const trophyByRank: Record<number, { src: string; alt: string; fallback: string }> = {
  1: { src: "/gold_tropy.png", alt: "gold", fallback: "🥇" },
  2: { src: "/silver_tropy.png", alt: "silver", fallback: "🥈" },
  3: { src: "/bronze_tropy.png", alt: "bronze", fallback: "🥉" },
};

const rowBaseClass =
  "flex items-center justify-between w-full rounded-2xl px-5 mb-3 py-4 bg-white/5 border border-white/10 shadow-sm";

const highlightFirstClass =
  "bg-gradient-to-r from-amber-500/30 via-amber-300/15 to-transparent border-amber-300/30";
const highlightSecondClass =
  "bg-gradient-to-r from-gray-300/30 via-gray-200/15 to-transparent border-gray-300/30";
const highlightThirdClass =
  "bg-gradient-to-r from-orange-400/30 via-orange-300/15 to-transparent border-orange-300/30";

export default function UnifiedRankList() {
  const [list, setList] = useState<RankingItemV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const imgErrorRef = useRef<Record<number, boolean>>({});
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setAnimate(false);
        const res = await fetch(`${URL}/api/v2/ranking/bias`);
        const json: ApiV2Response = await res.json();
        if (!mounted) return;
        if (json.success && Array.isArray(json.data)) {
          setList(json.data);
          // DOM 페인트 후 순차 애니메이션 시작
          setTimeout(() => setAnimate(true), 60);
        } else {
          setError(json.message || "랭킹 데이터를 가져오지 못했습니다.");
        }
      } catch (err) {
        setError("서버 연결 실패");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <></>
  }

  if (error) {
    return (
      <div className="w-full max-w-[640px] lg:max-w-[520px] px-3 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div
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

      {list.map((u) => {
        const isTop = u.rank <= 3;
        const trophy = trophyByRank[u.rank];
        const highlightClass = u.rank === 1
          ? highlightFirstClass
          : u.rank === 2
          ? highlightSecondClass
          : u.rank === 3
          ? highlightThirdClass
          : "";
        const rowClass = `${rowBaseClass} ${highlightClass}`;
        const deltaBadge = (u.delta || 0) === 0 ? (
          <span className="text-xs text-gray-300">-</span>
        ) : (u.delta || 0) < 0 ? (
          <span className="text-xs text-rose-400">▼ {Math.abs(u.delta)}</span>
        ) : (
          <span className="text-xs text-emerald-400">▲ {u.delta}</span>
        );
        const leftSlotClass = isTop
          ? "w-12 h-12 flex items-center justify-center"
          : "w-6 text-white/90 text-base tabular-nums text-center";
        const trophyImgClass = isTop ? "w-10 h-10 object-contain" : "w-6 h-6 object-contain";
        const trophyEmojiClass = isTop ? "text-3xl" : "text-xl";

        const motionClass = animate ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3";
        return (
          <div
            key={u.username}
            className={`${rowClass} will-change-transform transition-all duration-500 ease-out ${motionClass}`}
            style={{ transitionDelay: `${(u.rank - 1) * 60}ms` }}
          >
            {/* Left - Rank & Trophy & Username */}
            <div className="flex items-center gap-4 min-w-0">
              <div className={leftSlotClass}>
                {isTop ? (
                  (!imgErrorRef.current[u.rank] && trophy) ? (
                    <img
                      src={trophy.src}
                      alt={trophy.alt}
                      className={trophyImgClass}
                      onError={() => {
                        imgErrorRef.current[u.rank] = true;
                      }}
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
                <a 
                  href={`https://solved.ac/profile/${u.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white font-semibold truncate hover:text-red-300 hover:underline transition-colors cursor-pointer block"
                >
                  {u.username}
                </a>
                <div className="text-xs text-white/60 flex items-center gap-2">
                  <span>티어: {u.tier}</span>
                  <span className="text-white/20">|</span>
                  <span>순위 변화: {deltaBadge}</span>
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
          </div>
        
        );
      })}
    </div>
  );
}

