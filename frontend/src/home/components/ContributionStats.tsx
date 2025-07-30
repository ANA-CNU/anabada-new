import { useMemo, useState, useEffect } from "react";

function ContributionStats() {
  // 총 누적 기여수 계산
  const totalCumulativeContribution = useMemo(() => {
    return 12351251;
  }, []);

  // 애니메이션용 상태
  const [animatedValue, setAnimatedValue] = useState(0);

  // 숫자 포맷팅 함수 (3자리마다 쉼표)
  const formatNumber = (num: number) => {
    return num.toLocaleString('ko-KR');
  };

  // 5초 커스텀 애니메이션 효과 (최적화된 버전)
  useEffect(() => {
    const duration = 5000; // 5초
    const startTime = performance.now(); // performance.now() 사용으로 더 정확한 타이밍
    const startValue = 0;
    const endValue = totalCumulativeContribution;
    let animationId: number;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // 커스텀 이징: 0.5초에 95%, 1초에 99%, 나머지 4초에 1%
      let customProgress;
      if (progress <= 0.1) { // 0-0.5초 (10% 시간)
        customProgress = progress * 9.5; // 0-95%
      } else if (progress <= 0.2) { // 0.5-1초 (10% 시간)
        customProgress = 0.95 + (progress - 0.1) * 0.4; // 95%-99%
      } else { // 1-5초 (80% 시간)
        customProgress = 0.99 + (progress - 0.2) * 0.01; // 99%-100%
      }
      
      const currentValue = Math.floor(startValue + (endValue - startValue) * customProgress);
      setAnimatedValue(currentValue);

      if (progress < 1) {
        animationId = requestAnimationFrame(animate);
      }
    };

    animationId = requestAnimationFrame(animate);

    // 클린업 함수에서 애니메이션 정리
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [totalCumulativeContribution]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div className="text-center">
        <h2 className="text-white text-2xl font-bold mb-2">아나바다의</h2>
        <h1 className="text-4xl font-bold mb-4" style={{
          background: "linear-gradient(90deg, #8ec5fc 0%, #e0c3fc 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text"
        }}>
          누적 기여수
        </h1>
        <div 
          className="text-6xl font-bold text-white mb-4"
          style={{
            willChange: "transform, opacity",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden"
          }}
        >
          {formatNumber(animatedValue)}
        </div>
        <p className="text-white/70 text-sm mb-10">
          지금까지 함께 성장한 기여자들의 기록
        </p>
      </div>
    </div>
  );
}

export default ContributionStats; 