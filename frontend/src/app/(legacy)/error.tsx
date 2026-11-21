"use client";

import Link from "next/link";

export default function LegacyError({ reset }: { readonly reset: () => void }) {
  return (
    <main className="min-h-screen bg-[#0a1026] p-8 text-white flex flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">데이터를 불러오지 못했습니다.</h1>
      <p>잠시 후 다시 시도해 주세요.</p>
      <button className="px-5 py-3 border border-white/30 rounded-full" onClick={reset}>다시 시도</button>
      <Link className="underline" href="/">홈으로</Link>
    </main>
  );
}
