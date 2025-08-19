export interface ScoreRecord {
  id: string;
  user: string;
  reason: string;
  score: number;
  time: string;
}

export interface RecentProblem {
  id: string;
  user: string;
  problemNumber: number;
  solvedAt: string;
}

export interface MonthlyProblem {
  id: string;
  user: string;
  problemCount: number;
}

// 시간 포맷팅 유틸리티 함수들
export const formatRelativeTime = (timeString: string) => {
  const now = new Date();
  const time = new Date(timeString);

  console.log(timeString);
  console.log(time);

  const diffInMs = now.getTime() - time.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) return "방금 전";
  if (diffInMinutes < 60) return `${diffInMinutes}분 전`;
  if (diffInHours < 24) return `${diffInHours}시간 전`;
  if (diffInDays < 7) return `${diffInDays}일 전`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}주 전`;
  if (diffInDays < 365) return `${Math.floor(diffInDays / 30)}개월 전`;
  return `${Math.floor(diffInDays / 365)}년 전`;
};

export const formatExactTime = (timeString: string) => {
  const date = new Date(timeString);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

export const getScoreColor = (score: number, seed?: string) => {
  // 다채로운 팔레트에서 시드 기반으로 선택
  const palette = [
    // 밝은/파스텔 계열만 사용
    "bg-pink-400/20 text-pink-200 border-pink-400/30",
    "bg-fuchsia-400/20 text-fuchsia-200 border-fuchsia-400/30",
    "bg-rose-400/20 text-rose-200 border-rose-400/30",
    "bg-orange-400/20 text-orange-200 border-orange-400/30",
    "bg-amber-400/20 text-amber-200 border-amber-400/30",
    "bg-yellow-400/20 text-yellow-200 border-yellow-400/30",
    "bg-lime-400/20 text-lime-200 border-lime-400/30",
    "bg-green-400/20 text-green-200 border-green-400/30",
    "bg-emerald-400/20 text-emerald-200 border-emerald-400/30",
    "bg-teal-400/20 text-teal-200 border-teal-400/30",
    "bg-cyan-400/20 text-cyan-200 border-cyan-400/30",
    "bg-sky-400/20 text-sky-200 border-sky-400/30",
  ];

  // 높은 점수는 강조 색상 유지
  if (score >= 2) return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
  // if (score >= 200) return "bg-blue-500/20 text-blue-300 border-blue-500/30";
  // if (score >= 150) return "bg-green-500/20 text-green-300 border-green-500/30";

  const key = seed ?? String(score);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const idx = hash % palette.length;
  return palette[idx];
};

export const getProblemCountColor = (count: number) => {
  if (count >= 50) return "bg-gradient-to-r from-blue-500/80 via-purple-500/80 to-pink-500/80 text-white/100 border-purple-400/60 shadow-lg shadow-purple-400/30 animate-pulse";
  if (count >= 30) return "bg-black/40 text-red-400 border-red-600/60 shadow-2xl shadow-red-600/40 animate-pulse";
  if (count >= 20) return "bg-red-600/30 text-red-200 border-red-500/50 shadow-lg shadow-red-500/25";
  if (count >= 15) return "bg-yellow-500/30 text-yellow-200 border-yellow-400/50 shadow-lg shadow-yellow-500/25";
  if (count >= 10) return "bg-slate-400/30 text-slate-200 border-slate-300/50 shadow-lg shadow-slate-400/25";
  if (count >= 5) return "bg-gray-400/30 text-gray-200 border-gray-300/50 shadow-lg shadow-gray-400/25";
  return "bg-gray-500/20 text-gray-300 border-gray-400/30";
};

// 누적 해결 배지 색상 (마일스톤 기반)
export const getTotalSolvedColor = (count: number) => {
  if (count >= 2500) return "bg-gradient-to-r from-rose-500/70 via-purple-500/70 to-indigo-500/70 text-white border-white/30 shadow-xl shadow-purple-500/30 animate-pulse";
  if (count >= 2000) return "bg-gradient-to-r from-fuchsia-500/60 to-violet-500/60 text-white border-white/20 shadow-lg";
  if (count >= 1500) return "bg-gradient-to-r from-amber-500/60 to-rose-500/60 text-white border-white/20 shadow-lg";
  if (count >= 1000) return "bg-gradient-to-r from-blue-500/50 to-cyan-500/50 text-white border-white/20";
  if (count >= 900) return "bg-emerald-400/25 text-emerald-100 border-emerald-300/30";
  if (count >= 650) return "bg-green-500/25 text-green-100 border-green-300/30";
  if (count >= 400) return "bg-lime-500/25 text-lime-100 border-lime-300/30";
  if (count >= 200) return "bg-yellow-500/25 text-yellow-100 border-yellow-300/30";
  if (count >= 100) return "bg-amber-500/25 text-amber-100 border-amber-300/30";
  return "bg-gray-500/20 text-gray-300 border-gray-400/30";
};