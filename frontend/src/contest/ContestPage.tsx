import React from "react";
import Background from "../home/stats/Background";
import KakaoMap from "./components/KakaoMap";
import ContestRules from "./components/ContestRules";
import ContestCTA from "./components/ContestCTA";
import ContestHero from "./components/ContestHero";
import ContestCalender from "./components/ContestCalender";
import ContestAppBar from "./components/ContestAppBar";

const ContestPage: React.FC = () => {
  return (
    <div className="min-h-screen w-full bg-[#0a1026] text-white">
      <Background>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <ContestAppBar />
        {/* Hero */}
        <ContestHero />

        {/* Main Layout: left/right columns */}
        <section className="flex flex-col md:flex-row gap-4">
          {/* Left column: 2 components (일정, 시상) */}
          <div className="flex-1 flex flex-col gap-4">
            {/* 일정 */}
            <div className="rounded-2xl bg-gradient-to-b from-white/6 to-white/3 border border-white/10 p-6">
            <h2 className="text-lg font-bold mb-4">대회 일정</h2>
            <div className="mb-4">
              <ContestCalender anchorISO="2025-09-27" weeks={3} />
            </div>
            <ul className="space-y-2 text-white/90">
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400"></span> 2025.09.27 (토)</li>
              <li className="text-white/70 text-sm">12:00 ~ 13:00 특별 특강</li>
              <li className="text-white/70 text-sm">13:00 ~ 13:30 대회 OT</li>
              <li className="text-white/70 text-sm">13:30 ~ 16:30 대회 진행</li>
              <li className="text-white/70 text-sm">16:30 ~ 17:30 문제 해설 및 시상</li>
            </ul>
            </div>

            {/* 시상 */}
            <div className="rounded-2xl bg-gradient-to-b from-white/6 to-white/3 border border-white/10 p-6">
            <h2 className="text-lg font-bold mb-4">시상</h2>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-white/70">
                  <tr>
                    <th className="px-4 py-2">구분</th>
                    <th className="px-4 py-2">시상 내역</th>
                    <th className="px-4 py-2">시상 팀수</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="odd:bg-white/0 even:bg-white/2">
                    <td className="px-4 py-2">대상</td>
                    <td className="px-4 py-2">600,000원</td>
                    <td className="px-4 py-2">1팀</td>
                  </tr>
                  <tr className="odd:bg-white/0 even:bg-white/2">
                    <td className="px-4 py-2">금상</td>
                    <td className="px-4 py-2">400,000원</td>
                    <td className="px-4 py-2">2팀</td>
                  </tr>
                  <tr className="odd:bg-white/0 even:bg-white/2">
                    <td className="px-4 py-2">은상</td>
                    <td className="px-4 py-2">200,000원</td>
                    <td className="px-4 py-2">3팀</td>
                  </tr>
                  <tr className="odd:bg-white/0 even:bg-white/2">
                    <td className="px-4 py-2">동상</td>
                    <td className="px-4 py-2">100,000원</td>
                    <td className="px-4 py-2">5팀</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-white/60 text-xs mt-3">시상금과 함께 "충남대학교 데이터보안활용 혁신융합대학사업단장상" 수여</p>
            </div>

            {/* 규칙/CTA는 하단으로 이동 */}
          </div>

          {/* Right column: 참가 자격 + 장소 */}
          <div className="w-full md:w-[38%] flex flex-col gap-4">
            {/* 참가 자격 (높이 제한) */}
            <div className="rounded-2xl bg-gradient-to-b from-white/6 to-white/3 border border-white/10 p-6 max-h-[240px] overflow-auto">
              <h2 className="text-lg font-bold mb-4">참가 자격</h2>
              <ul className="space-y-2 text-white/90">
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400"></span> 충남대학교 학생</li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400"></span> COSS 컨소시엄 소속 학생</li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400"></span> 1~3인 팀 구성</li>
              </ul>
            </div>

            {/* 장소/접수 (지도 포함) */}
            <div className="rounded-2xl bg-gradient-to-b from-white/6 to-white/3 border border-white/10 p-6">
              <h2 className="text-lg font-bold mb-4">장소 · 접수</h2>
              <ul className="space-y-2 text-white/90">
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-400"></span> 장소: 충남대학교 교내 (추후 공지)</li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-400"></span> 접수: 9월 8일 (월) ~ 9월 19일 (금)</li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-400"></span> 대회: 9월 27일 (토) 12:00 ~ 17:30</li>
              </ul>
              <div className="mt-4 rounded-xl overflow-hidden border border-white/10">
                <KakaoMap lat={36.36660422255552} lng={127.34434347433623} level={3} markerTitle="충남대학교 공과대학 5호관" className="w-full h-64 md:h-80" />
              </div>
            </div>
          </div>
        </section>

        {/* Footer-like bottom sections */}
        <section className="mt-6 rounded-2xl bg-gradient-to-b from-white/6 to-white/3 border border-white/10 p-6">
          <h2 className="text-lg font-bold mb-2">역대 대회/문제 아카이브</h2>
          <p className="text-white/75 text-sm mb-3">
            역대 충남대학교 대회와 출제 문제는 백준 카테고리에서 확인할 수 있어요.
          </p>
          <a
            href="https://www.acmicpc.net/category/402"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white/90 px-4 py-2 text-sm transition-colors"
          >
            백준 카테고리 바로가기
          </a>
        </section>

        <ContestRules />
        <ContestCTA />
      </div>
      </Background>
    </div>
  );
};

export default ContestPage;


