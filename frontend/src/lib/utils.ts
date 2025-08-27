import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 티어 관련 유틸리티
export const getTierName = (tier: number): string => {
  if (tier === 31) return 'MASTER';
  if (tier === 0) return 'UNKNOWN';
  
  let tierName = '';
  if (tier >= 26) tierName = 'RUBY ';
  else if (tier >= 21) tierName = 'DIAMOND';
  else if (tier >= 16) tierName = 'PLATINUM';
  else if (tier >= 11) tierName = 'GOLD';
  else if (tier >= 6) tierName = 'SILVER';
  else if (tier >= 1) tierName = 'BRONZE';

  const step = 5 - ((tier - 1) % 5);
  tierName += ' ';
  
  if (step === 1) tierName += 'I';
  if (step === 2) tierName += 'II';
  if (step === 3) tierName += 'III';
  if (step === 4) tierName += 'IV';
  if (step === 5) tierName += 'V';

  return tierName;
};

export const getTierColor = (tier: number): string => {
  if (tier >= 26) return 'text-red-500';
  if (tier >= 21) return 'text-blue-400';
  if (tier >= 16) return 'text-cyan-300';
  if (tier >= 11) return 'text-yellow-400';
  if (tier >= 6) return 'text-gray-300';
  if (tier >= 1) return 'text-amber-600';
  return 'text-gray-500';
};

// 날짜 포맷팅
export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('ko-KR');
};

// 정확도 계산
export const calculateAccuracy = (corrects: number, submissions: number): number => {
  if (submissions === 0) return 0;
  return Number(((corrects / submissions) * 100).toFixed(1));
};

// 평균 점수 계산
export const calculateAverageScore = (scoreHistory: ScoreHistory[]): number => {
  if (scoreHistory.length === 0) return 0;
  const totalBias = scoreHistory.reduce((sum, record) => sum + record.bias, 0);
  return Number((totalBias / scoreHistory.length).toFixed(1));
};
