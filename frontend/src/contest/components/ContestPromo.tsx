import React from "react";
import { Link } from "react-router-dom";

const ContestPromo: React.FC = () => {
  return (
    <section className="w-full px-10 mb-10 lg:px-20 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="w-full rounded-2xl bg-gradient-to-r from-amber-400/20 via-amber-200/10 to-white/5 outline outline-1 outline-amber-300/30 outline-offset-0 text-white p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="flex-1">
            <h2 className="text-xl md:text-2xl font-bold mb-2">💫 2025 충남대학교 SW-IT Contest</h2>
            <p className="text-white/80 text-sm md:text-base">
              ANA에서 매년 개최하는 프로그래밍 대회, SW-IT Contest(스위트콘)의 참가 신청이 시작되었습니다. 팀원들과 함께 준비한 문제를 풀고 상금을 노려보세요!
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://forms.gle/rsReeLGpgHWntZtv8"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 bg-amber-500/90 hover:bg-amber-500 text-black font-semibold transition-colors"
            >
              참가 신청
            </a>
            <Link
              to="/contest"
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 border border-white/30 hover:border-white/60 text-white/90 hover:text-white transition-colors"
            >
              자세히 보기
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContestPromo;


