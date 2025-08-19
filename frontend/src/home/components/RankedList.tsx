import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Ranked } from "@/resource/dummy";
import { Card, CardContent } from "@/components/ui/card"; // shadcn/ui의 Card 컴포넌트

interface RankedListProps {
  list: Ranked[];
  showBias?: boolean; // bias 표시 여부 (첫 번째 리스트용)
}

const borderColors = [
  "border-yellow-400 shadow-[0_0_8px_2px_rgba(255,215,0,0.3)] hover:shadow-[0_0_16px_4px_rgba(255,215,0,0.5)] hover:scale-105",
  "border-gray-300 shadow-[0_0_8px_2px_rgba(192,192,192,0.25)] hover:shadow-[0_0_16px_4px_rgba(192,192,192,0.4)] hover:scale-105",
  "border-amber-700 shadow-[0_0_8px_2px_rgba(205,127,50,0.22)] hover:shadow-[0_0_16px_4px_rgba(205,127,50,0.35)] hover:scale-105",
];

function RankedList({ list, showBias = false }: RankedListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const animationRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (listRef.current) {
      // 이전 애니메이션 정리
      if (animationRef.current) {
        animationRef.current.kill();
      }
      
      // DOM 요소가 렌더링된 후 애니메이션 실행을 위한 지연
      const timer = setTimeout(() => {
        const rankItems = listRef.current?.querySelectorAll(".rank-item");
        if (rankItems && rankItems.length > 0) {
          // 성능 최적화를 위한 설정 (Safari 최적화 포함)
          gsap.set(rankItems, {
            willChange: "transform, opacity",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
            webkitBackfaceVisibility: "hidden"
          });
          
          animationRef.current = gsap.fromTo(
            rankItems,
            { y: 40, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              stagger: 0.08,
              duration: 0.5,
              ease: "power2.out",
              force3D: true, // GPU 가속 강제 활성화
            }
          );
        }
      }, 100); // 100ms 지연으로 DOM 렌더링 완료 보장

      return () => clearTimeout(timer);
    }

    // 컴포넌트 언마운트 시 애니메이션 정리
    return () => {
      if (animationRef.current) {
        animationRef.current.kill();
      }
    };
  }, [list]);

  const handleMouseEnter = (idx: number) => {
    const el = cardRefs.current[idx];
    if (el) {
      gsap.fromTo(
        el,
        { scale: 1 },
        { 
          scale: 1.08, 
          duration: 0.15, 
          yoyo: true, 
          repeat: 1, 
          ease: "power1.out",
          force3D: true // GPU 가속 강제 활성화
        }
      );
    }
  };

  return (
    <div
      className="h-full max-h-[180px] sm:max-h-[450px] flex flex-col items-center py-4 px-4 w-full overflow-y-auto scrollbar-thin scrollbar-thumb-transparent scrollbar-track-transparent"
      ref={listRef}
      style={{ 
        scrollbarColor: 'transparent transparent', 
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        willChange: "scroll-position",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        WebkitOverflowScrolling: "touch"
      }}
    >
      <style>{`
        .scrollbar-thin::-webkit-scrollbar {
          width: 0px !important;
          background: transparent !important;
          display: none !important;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: transparent !important;
          display: none !important;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent !important;
          display: none !important;
        }
        .scrollbar-thin::-webkit-scrollbar-corner {
          background: transparent !important;
          display: none !important;
        }
        .scrollbar-thin::-webkit-scrollbar-button {
          display: none !important;
        }
        .scrollbar-thin::-webkit-scrollbar-track-piece {
          background: transparent !important;
          display: none !important;
        }
        /* 사파리 전용 스크롤바 숨김 */
        .scrollbar-thin {
          -webkit-overflow-scrolling: touch;
        }
        .scrollbar-thin::-webkit-scrollbar {
          -webkit-appearance: none;
          width: 0 !important;
          height: 0 !important;
        }
        /* Safari 스크롤 성능 최적화 */
        .scrollbar-thin {
          -webkit-overflow-scrolling: touch;
          -webkit-transform: translateZ(0);
          transform: translateZ(0);
        }
      `}</style>
      {list.map((item, idx) => {
        const borderClass = idx < 3 ? borderColors[idx] : "border-white/20 hover:scale-[1.02] hover:shadow-lg";
        const usernameClass = idx < 3 ? "text-white" : "text-inherit";
        return (
          <Card
            key={item.username}
            ref={el => { cardRefs.current[idx] = el; }}
            onMouseEnter={() => handleMouseEnter(idx)}
            className={`rank-item w-full mb-2 h-[35px] min-h-[35px] max-h-[35px] py-0 flex bg-white/10 backdrop-blur-md backdrop-saturate-150 border ${borderClass}`}
            style={{
              willChange: "transform, opacity",
              transform: "translateZ(0)",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden"
            }}
          >
            <CardContent 
              className="flex flex-row items-center justify-between px-2 py-0 h-full w-full"
              style={{
                willChange: "transform",
                transform: "translateZ(0)",
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden"
              }}
            >
              <div className="flex items-center gap-1">
                <span className="font-bold text-sm w-5 text-right text-white">{idx + 1}</span>
                <span className="font-mono text-xs text-white">{item.username}</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span>티어: {item.tier}</span>
                <span>|</span>
                {showBias ? (
                  <span>가중치: {item.bias}</span>
                ) : (
                  <span>푼 문제: {item.solved}</span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default RankedList;