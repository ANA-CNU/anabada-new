import { useEffect, useRef } from "react";
import gsap from "gsap";
import styles from './LeftHeadWrapper.module.css';

function LeftHeadWrapper() {
  const leftRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (leftRef.current) {
      // 이전 애니메이션 정리
      if (animationRef.current) {
        animationRef.current.kill();
      }
      
      // DOM 요소가 렌더링된 후 애니메이션 실행을 위한 지연
      const timer = setTimeout(() => {
        const titleItems = leftRef.current?.querySelectorAll(".title-item");
        if (titleItems && titleItems.length > 0) {
          // 성능 최적화를 위한 설정 (Safari 최적화 포함)
          gsap.set(titleItems, {
            willChange: "transform, opacity",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
            webkitBackfaceVisibility: "hidden"
          });
          
          animationRef.current = gsap.fromTo(
            titleItems,
            { y: 40, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              stagger: 1.1,
              duration: 0.8,
              ease: "power3.out",
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
  }, []);

  return (
    <div
      className="flex flex-col justify-center items-center mb-4 lg:mb-10 lg:items-start h-full px-8 lg:pl-12 lg:pr-4 w-full lg:w-[40%] text-center lg:text-left"
      ref={leftRef}
    >
      <h1 className="title-item text-4xl font-bold text-white mb-6 opacity-0 flex gap-2 flex-wrap justify-center lg:justify-start">
        <span className={styles['floating-title1']}>Challange</span>
        <span className={styles['floating-title2']}>Rank</span>
        <span className={styles['floating-title3']}>Win</span>
      </h1>
      <h1 className="title-item text-2xl font-medium text-white mb-6 opacity-0">
        <span className={`${styles['gradient-text']} mr-2`}>문제</span>
        <span>를 풀고,</span>
        <span className={`${styles['gradient-text']} mx-2`}>상품</span>
        <span>을 얻고,</span>
        <span className={`${styles['gradient-text']} mx-2`}>성장</span>
        <span>하세요.</span>
      </h1>
      <h1 className={`title-item opacity-0 ${styles['anabada-title']}`}>
        ANABADA
      </h1>
    </div>
  );
}

export default LeftHeadWrapper; 