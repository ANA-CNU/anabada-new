import { SquircleSurface } from "@/components/ui/squircle";
import React from "react";

const ContestCTA: React.FC = () => {
  return (
    <SquircleSurface asChild radius="surface"><section className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 p-6 text-white">
      <div className="text-white/80">문의: ANA 운영진</div>
      <SquircleSurface asChild radius="control"><a
        href="https://forms.gle/rsReeLGpgHWntZtv8"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-amber-400/90 hover:bg-amber-400 text-black font-semibold px-5 py-2 transition-colors"
      >
        참가 신청 바로가기
      </a></SquircleSurface>
    </section></SquircleSurface>
  );
};

export default ContestCTA;

