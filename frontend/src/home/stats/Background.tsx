import React from "react";

interface BackgroundProps {
  children?: React.ReactNode;
}

function Background({ children }: BackgroundProps) {
  return (
    <div className="relative w-full flex items-center justify-center overflow-hidden min-h-screen">
      {/* 더 어두운 배경 그라데이션 */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(to bottom, #000 0%, #181a2a 35%, #181a2a 60%, #0a1026 100%)",
        zIndex: 0
      }} />
      {/* 상단 강원들 (3개) - GPU 최적화 */}
      <div 
        className="pointer-events-none absolute left-[15%] top-[15%] -translate-x-1/2 -translate-y-1/2 w-[35vw] h-[35vw] rounded-full opacity-35 blur-3xl animate-glow1"
        style={{
          background: "radial-gradient(circle, #e0c3fc 0%, #8ec5fc 60%, transparent 100%)", 
          zIndex: 1,
          willChange: "transform, opacity",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden"
        }} 
      />
      <div 
        className="pointer-events-none absolute left-[50%] top-[20%] -translate-x-1/2 -translate-y-1/2 w-[25vw] h-[25vw] rounded-full opacity-30 blur-2xl animate-glow2"
        style={{
          background: "radial-gradient(circle, #fffbe6 0%, #a18cd1 60%, transparent 100%)", 
          zIndex: 1,
          willChange: "transform, opacity",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden"
        }} 
      />
      <div 
        className="pointer-events-none absolute left-[80%] top-[25%] -translate-x-1/2 -translate-y-1/2 w-[20vw] h-[20vw] rounded-full opacity-25 blur-2xl animate-glow3"
        style={{
          background: "radial-gradient(circle, #fbc2eb 0%, #a6c1ee 60%, transparent 100%)", 
          zIndex: 1,
          willChange: "transform, opacity",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden"
        }} 
      />
      
      {/* 중간 강원 (1개) - GPU 최적화 */}
      <div 
        className="pointer-events-none absolute left-[40%] top-[50%] -translate-x-1/2 -translate-y-1/2 w-[30vw] h-[30vw] rounded-full opacity-20 blur-3xl animate-glow4"
        style={{
          background: "radial-gradient(circle, #a8edea 0%, #fed6e3 60%, transparent 100%)", 
          zIndex: 1,
          willChange: "transform, opacity",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden"
        }} 
      />
      
      {/* 하단 오른쪽 강원 (1개) - GPU 최적화 */}
      <div 
        className="pointer-events-none absolute left-[75%] top-[82%] -translate-x-1/2 -translate-y-1/2 w-[25vw] h-[25vw] rounded-full opacity-30 blur-2xl animate-glow5"
        style={{
          background: "radial-gradient(circle, #ffecd2 0%,rgb(63, 35, 26) 60%, transparent 100%)", 
          zIndex: 1,
          willChange: "transform, opacity",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden"
        }} 
      />
      {/* 아주 옅은 격자 패턴 (SVG, 간격 넓힘, 투명도 살짝 진하게) */}
      <div className="pointer-events-none absolute inset-0 opacity-9" style={{zIndex: 2}}>
        <svg width="100%" height="100%" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#fff" strokeWidth="0.3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
      {/* 비네트 효과 */}
      <div className="pointer-events-none absolute inset-0 bg-black opacity-50 rounded-2xl" style={{maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, white 60%, transparent 100%)', WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, white 60%, transparent 100%)', zIndex: 3}} />
      {/* 애니메이션 keyframes 정의 - GPU 가속 최적화 */}
      <style>{`
        @keyframes glow1 {
          0%, 100% { 
            transform: translate3d(-50%, -50%, 0) scale(1); 
            opacity: 0.35; 
          }
          50% { 
            transform: translate3d(-48%, -52%, 0) scale(1.05); 
            opacity: 0.45; 
          }
        }
        @keyframes glow2 {
          0%, 100% { 
            transform: translate3d(-50%, -50%, 0) scale(1); 
            opacity: 0.3; 
          }
          50% { 
            transform: translate3d(-52%, -48%, 0) scale(1.08); 
            opacity: 0.4; 
          }
        }
        @keyframes glow3 {
          0%, 100% { 
            transform: translate3d(-50%, -50%, 0) scale(1); 
            opacity: 0.25; 
          }
          50% { 
            transform: translate3d(-49%, -51%, 0) scale(1.1); 
            opacity: 0.35; 
          }
        }
        @keyframes glow4 {
          0%, 100% { 
            transform: translate3d(-50%, -50%, 0) scale(1); 
            opacity: 0.2; 
          }
          50% { 
            transform: translate3d(-51%, -49%, 0) scale(1.06); 
            opacity: 0.3; 
          }
        }
        @keyframes glow5 {
          0%, 100% { 
            transform: translate3d(-50%, -50%, 0) scale(1); 
            opacity: 0.3; 
          }
          50% { 
            transform: translate3d(-49%, -51%, 0) scale(1.07); 
            opacity: 0.4; 
          }
        }
        .animate-glow1 { 
          animation: glow1 8s ease-in-out infinite; 
          will-change: transform, opacity;
          transform: translateZ(0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .animate-glow2 { 
          animation: glow2 12s ease-in-out infinite; 
          will-change: transform, opacity;
          transform: translateZ(0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .animate-glow3 { 
          animation: glow3 16s ease-in-out infinite; 
          will-change: transform, opacity;
          transform: translateZ(0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .animate-glow4 { 
          animation: glow4 10s ease-in-out infinite; 
          will-change: transform, opacity;
          transform: translateZ(0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .animate-glow5 { 
          animation: glow5 14s ease-in-out infinite; 
          will-change: transform, opacity;
          transform: translateZ(0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .opacity-9 { opacity: 0.09; }
      `}</style>
      {/* 작업 공간 */}
      <div className="relative flex flex-col items-center justify-center w-full h-full z-10">
        {children}
      </div>
    </div>
  );
}

export default Background; 