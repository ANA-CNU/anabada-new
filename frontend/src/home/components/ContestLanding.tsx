import { SquircleSurface } from "@/components/ui/squircle";
import { ArrowUpRight, FileText } from "lucide-react";
import React, { useEffect, useState } from "react";
import { getContestCountdown, type Countdown } from "./contest-countdown";

type CountdownPart = {
  readonly value: string;
  readonly unit: "일" | "시" | "분" | "초";
};

function formatCountdown({ days, hours, minutes, seconds }: Countdown): readonly CountdownPart[] {
  return [
    { value: String(days).padStart(2, "0"), unit: "일" },
    { value: String(hours).padStart(2, "0"), unit: "시" },
    { value: String(minutes).padStart(2, "0"), unit: "분" },
    { value: String(seconds).padStart(2, "0"), unit: "초" },
  ];
}

const ContestLanding: React.FC = () => {
  const [countdown, setCountdown] = useState<Countdown>(() => getContestCountdown(new Date()));
  const hasStarted = countdown.days === 0 && countdown.hours === 0 && countdown.minutes === 0 && countdown.seconds === 0;

  useEffect(() => {
    const updateCountdown = () => setCountdown(getContestCountdown(new Date()));
    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <section className="w-full px-4 py-6 mb-10 md:px-10 lg:px-20 break-keep [overflow-wrap:anywhere]" aria-labelledby="contest-landing-title">
      <div className="max-w-6xl mx-auto">
        <SquircleSurface radius="panel" className="w-full border border-white/10 bg-white/10 p-6 text-white md:p-8">
          <div className="text-center">
            <h2 id="contest-landing-title" className="mb-2 text-sm font-medium tracking-[0.14em] text-white/60">
              {hasStarted ? "2026 SW-IT 대회 시작" : "2026 SW-IT 대회까지"}
            </h2>
            <output role="timer" aria-live="off" aria-label="대회 시작까지 남은 시간" className="flex flex-wrap items-baseline justify-center gap-x-1 gap-y-1 font-mono text-3xl font-semibold tabular-nums tracking-tight text-blue-100 sm:gap-x-2 sm:text-5xl lg:text-6xl">
              {formatCountdown(countdown).map(({ value, unit }) => (
                <span key={unit} className="whitespace-nowrap">
                  {value}<span className="ml-0.5 text-sm font-medium text-white/70 sm:text-base">{unit}</span>
                </span>
              ))}
            </output>
            <p className="mt-2 text-sm text-white/55">{hasStarted ? "대회가 시작되었습니다." : "남았습니다."}</p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <SquircleSurface asChild radius="surface"><a
              href="https://2026-swit-contest.anacnu.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="group block border border-blue-300/30 bg-white/5 p-5 transition-colors hover:border-blue-200/70 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-200"
            >
              <span className="flex items-start justify-between gap-4">
                <span>
                  <span className="block text-lg font-semibold text-white">2026 대회 사이트</span>
                  <span className="mt-2 block text-sm leading-6 text-white/70">참가 안내와 대회 소식을 확인하세요.</span>
                </span>
                <ArrowUpRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-blue-200" />
              </span>
            </a></SquircleSurface>

            <SquircleSurface asChild radius="surface"><a
              href="https://aoj.anacnu.kr/sources/11"
              target="_blank"
              rel="noopener noreferrer"
              className="group block border border-white/15 bg-white/5 p-5 transition-colors hover:border-white/35 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-200"
            >
              <span className="flex items-start justify-between gap-4">
                <span>
                  <span className="block text-lg font-semibold text-white">작년 문제셋</span>
                  <span className="mt-2 block text-sm leading-6 text-white/70">지난 대회 문제로 실전 감각을 미리 익혀보세요.</span>
                </span>
                <ArrowUpRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-white/70" />
              </span>
            </a></SquircleSurface>
          </div>

          <p className="mt-5 flex items-center gap-2 text-sm text-white/65">
            <FileText aria-hidden="true" className="size-4 shrink-0" />
            <a href="/2025_SW-IT-Contest_edi.pdf" target="_blank" rel="noopener noreferrer" className="underline decoration-white/40 underline-offset-4 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-200">
              2025 SW-IT Contest 에디토리얼 보기
            </a>
          </p>
        </SquircleSurface>
      </div>
    </section>
  );
};

export default ContestLanding;
