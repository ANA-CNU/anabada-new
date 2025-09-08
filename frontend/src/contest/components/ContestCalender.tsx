import React from "react";

type Props = {
  anchorISO: string;
  weeks?: number;
};

// 미니 달력: 기준 날짜 주와 그 이전 주들을 포함해 weeks주 렌더링 (KST 기준)
const ContestCalender: React.FC<Props> = ({ anchorISO, weeks = 3 }) => {
  // KST 기준 연/월/일을 추출하는 헬퍼
  const getKSTYmd = (d: Date) => {
    const fmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc; }, {});
    const y = Number(parts.year);
    const m = Number(parts.month);
    const da = Number(parts.day);
    return { y, m, da };
  };

  // 기준일을 KST 자정 Date로 생성
  const { y: ay, m: am, da: ad } = getKSTYmd(new Date(anchorISO));
  const anchor = new Date(ay, am - 1, ad);

  const dayOfWeek = anchor.getDay(); // 0=Sun
  const startOfAnchorWeek = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - dayOfWeek);
  const start = new Date(startOfAnchorWeek.getFullYear(), startOfAnchorWeek.getMonth(), startOfAnchorWeek.getDate() - (weeks - 1) * 7);

  const days: Date[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }

  const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  // 오늘(KST 자정)
  const { y: ty, m: tm, da: td } = getKSTYmd(new Date());
  const today = new Date(ty, tm - 1, td);

  // 신청기간: 9월 8일 ~ 9월 19일 (KST, inclusive)
  const applyStart = new Date(2025, 8, 8);
  const applyEnd = new Date(2025, 8, 19);

  const weekDayLabels = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div className="w-full">
      <div className="grid grid-cols-7 text-[11px] md:text-xs text-white/60 mb-2">
        {weekDayLabels.map((w) => (
          <div key={w} className="text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const isAnchor = isSameDay(d, anchor);
          const isToday = isSameDay(d, today);
          const isCurrentMonth = d.getMonth() === anchor.getMonth();
          const inApply = d >= applyStart && d <= applyEnd;
          const isPast = d < today; // KST 기준 오늘 이전
          const base = "rounded-md px-0.5 py-2 text-center text-xs md:text-sm border";
          const tone = isAnchor
            ? "bg-amber-400/20 border-amber-300/50 text-amber-100"
            : isToday
            ? "bg-white/15 border-white/40 text-white shadow-[0_0_14px_rgba(255,255,255,0.35)]"
            : isPast
            ? "bg-white/[0.02] border-white/5 text-white/30"
            : inApply
            ? "bg-rose-500/20 border-rose-400/50 text-rose-100"
            : isCurrentMonth
            ? "bg-white/5 border-white/10 text-white/80"
            : "bg-white/[0.03] border-white/5 text-white/40";
          return (
            <div key={d.toISOString()} className={`${base} ${tone}`}>
              {d.getDate()}
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] md:text-xs text-white/50">
        기준일: {anchor.getFullYear()}.{String(anchor.getMonth() + 1).padStart(2, "0")}.
        {String(anchor.getDate()).padStart(2, "0")} (토)
      </div>
    </div>
  );
};

export default ContestCalender;


