import { SquircleSurface } from "@/components/ui/squircle";
import { ArrowUpRight, Check, FileText, ListChecks } from "lucide-react";
import React from "react";

const ContestLanding: React.FC = () => {
  return (
    <section className="w-full px-4 py-6 mb-10 md:px-10 lg:px-20 break-keep [overflow-wrap:anywhere]" aria-labelledby="contest-landing-title">
      <div className="max-w-6xl mx-auto">
        <SquircleSurface radius="panel" className="w-full border border-white/10 bg-white/10 p-6 text-white md:p-8">
          <div className="text-center">
            <SquircleSurface radius="control" className="mx-auto mb-4 flex size-12 items-center justify-center border border-white/15 bg-white/5">
              <Check aria-hidden="true" className="size-6 text-white/80" />
            </SquircleSurface>
            <h2 id="contest-landing-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              2026 SW-IT Contest가 종료되었습니다!
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/70">참여해 주신 모든 분들께 감사드립니다. 2027 SW-IT Contest도 기대해 주세요!</p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <SquircleSurface asChild radius="surface"><a
              href="https://aoj.anacnu.kr/sources/408"
              target="_blank"
              rel="noopener noreferrer"
              className="group block border border-white/15 bg-white/5 p-5 transition-colors hover:border-white/35 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-200"
            >
              <span className="flex items-start gap-4">
                <ListChecks aria-hidden="true" className="mt-1 size-5 shrink-0 text-white/70" />
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold text-white">2026 문제 보러가기</span>
                  <span className="mt-2 block text-sm leading-6 text-white/70">대회에서 출제된 문제를 풀어보세요.</span>
                </span>
                <ArrowUpRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-white/70" />
              </span>
            </a></SquircleSurface>

            <SquircleSurface asChild radius="surface"><a
              href="/swit-2026-editorial.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="group block border border-white/15 bg-white/5 p-5 transition-colors hover:border-white/35 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-200"
            >
              <span className="flex items-start gap-4">
                <FileText aria-hidden="true" className="mt-1 size-5 shrink-0 text-white/70" />
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold text-white">에디토리얼 보기</span>
                  <span className="mt-2 block text-sm leading-6 text-white/70">문제별 풀이와 해설을 확인하세요.</span>
                </span>
                <ArrowUpRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-white/70" />
              </span>
            </a></SquircleSurface>
          </div>
        </SquircleSurface>
      </div>
    </section>
  );
};

export default ContestLanding;
