import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const ContestCountdown: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  useEffect(() => {
    const targetDate = new Date('2025-09-27T11:00:00+09:00'); // 2025년 9월 27일 11:00 KST 기준
    
    const updateCountdown = () => {
      const now = new Date();
      const difference = targetDate.getTime() - now.getTime();
      
      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);
        
        setTimeLeft({ days, hours, minutes, seconds });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="w-full px-10 mb-10 lg:px-20 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="w-full rounded-2xl bg-gradient-to-r from-purple-400/20 via-purple-200/10 to-white/5 outline outline-1 outline-purple-300/30 outline-offset-0 text-white p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="flex-1">
            <h2 className="text-xl md:text-2xl font-bold mb-2">🏆 2025 충남대학교 SW-IT Contest</h2>
            <p className="text-white/80 text-sm md:text-base mb-3">
              참가 신청이 마감되었습니다! 이제 본격적인 준비를 시작하세요. 백준 온라인 저지에 있는 기출문제들을 통해 실전 감각을 익히고 좋은 성과를 거두시길 바랍니다.
            </p>
          </div>
          <div className="flex flex-col items-center gap-4">
            <div className="text-center">
              <div className="text-sm text-white/70 mb-2">대회까지 남은 시간</div>
              <div className="bg-purple-500/20 px-4 py-3 rounded-lg w-64 text-center">
                <div className="text-purple-300 text-lg font-bold">
                  {timeLeft.days}일 {timeLeft.hours}시간 {timeLeft.minutes}분 {timeLeft.seconds}초
                </div>
              </div>
            </div>
            <Link
              to="/contest"
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 border border-white/30 hover:border-white/60 text-white/90 hover:text-white transition-colors"
            >
              대회 정보 보기
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContestCountdown;
