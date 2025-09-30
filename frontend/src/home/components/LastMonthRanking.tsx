import React, { useEffect, useState } from 'react';
import { Trophy, TrendingUp, Calendar, Crown } from 'lucide-react';
import { getProblemCountColor } from './activity/types';
import { URL } from '@/resource/constant';

interface RankItem {
    name : string;
    rank : number;
    lastMonthSolved : number;
    lastMonthScore : number;
}

interface Response {
    data : RankItem[];
    message : string;
    success : boolean;
}

const LastMonthRanking: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [rankList, setRankList] = useState<RankItem[]>([]);

    useEffect(() => {
        const fetchRankList = async () => {
            const response = await fetch(`${URL}/api/ranking/selected-month-board`);
            const res: Response = await response.json();
            console.log(res)
            setRankList(res.data);
            setIsLoading(false);
        }
        fetchRankList();
    }, [])

  const getTrophyIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-4 h-4 text-yellow-300 drop-shadow-[0_0_10px_rgba(250,204,21,0.6)]" />;
    if (rank === 2) return <Trophy className="w-4 h-4 text-gray-200 drop-shadow-[0_0_10px_rgba(229,231,235,0.45)]" />;
    if (rank === 3) return <Trophy className="w-4 h-4 text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.55)]" />;
    return <TrendingUp className="w-3 h-3 text-blue-400" />;
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return "text-yellow-400";
    if (rank === 2) return "text-gray-300";
    if (rank === 3) return "text-amber-600";
    return "text-white/80";
  };

  return (
    <section className="pb-20 px-4 lg:px-6">
      <div className="max-w-screen-2xl mx-auto">
        {/* 섹션 헤더 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Calendar className="w-7 h-7 text-blue-300 drop-shadow-[0_0_12px_rgba(59,130,246,0.45)]" />
            <h2 className="text-2xl lg:text-4xl font-extrabold bg-gradient-to-r from-blue-200 via-white to-blue-300 bg-clip-text text-transparent tracking-wide">
              지난 달 최종 추첨 결과
            </h2>
          </div>
          <div className="mx-auto w-20 h-1.5 rounded-full bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-400 blur-[0.5px] mb-3" />
          <p className="text-white/70 text-base max-w-2xl mx-auto">
            지난 달 가중치를 고려하여 최종적으로 추첨된 사용자들입니다.
          </p>
        </div>

        {/* 랭킹 리스트 */}
        <div className="relative bg-black/30 backdrop-blur-md border border-white/10 rounded-2xl p-4 sm:p-6 lg:p-8 overflow-hidden">
          {/* 그라데이션 보더/글로우 */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
          <div className="pointer-events-none absolute -inset-px rounded-[1.1rem] bg-gradient-to-br from-blue-500/15 via-cyan-400/10 to-blue-500/15 blur-xl" />
          {isLoading ? (
            // 로딩 스켈레톤
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2 lg:gap-3">
              {Array.from({ length: 7 }).map((_, index) => (
                <div
                  key={index}
                  className="group relative bg-white/5 rounded-lg p-4 sm:p-5 flex flex-col items-center justify-center min-h-[150px] sm:min-h-[170px] animate-pulse"
                >
                  {/* 순위 배지 스켈레톤 */}
                  <div className="flex flex-col items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/20 animate-pulse"></div>
                  </div>

                  {/* 사용자 이름 스켈레톤 */}
                  <div className="text-center w-full">
                    <div className="h-3 sm:h-4 bg-white/20 rounded mb-1 sm:mb-2 mx-auto w-12 sm:w-16 animate-pulse"></div>
                    {/* 추가 정보 스켈레톤 */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-white/40 text-xs">문제:</span>
                        <div className="h-3 sm:h-4 bg-white/20 rounded w-6 sm:w-8 animate-pulse"></div>
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-white/40 text-xs">점수:</span>
                        <div className="h-3 sm:h-4 bg-white/20 rounded w-8 sm:w-12 animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : rankList.length === 0 ? (
            // 데이터가 없는 경우
            <div className="text-center py-12 sm:py-16">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-white/40" />
              </div>
              <h3 className="text-white/60 text-base sm:text-lg font-medium mb-2">
                최초 추첨이 아직 결정되지 않았습니다.
              </h3>
              <p className="text-white/40 text-xs sm:text-sm px-4">
                최초 추첨 이후 부터 해당 컴포넌트에 데이터가 표시됩니다.
              </p>
            </div>
          ) : (
            // 실제 데이터 표시 (3명 상단, 4명 하단)
            <div className="space-y-2 lg:space-y-3">
              {/* 상단 3명 */}
              <div className="grid grid-cols-3 gap-4 lg:gap-5 justify-items-center">
                {rankList.slice(0, 3).map((item, index) => {
                  const rank = item.rank;
                  return (
                    <div
                      key={`top-${index}`}
                      className={`group relative bg-white/5 hover:bg-white/10 rounded-lg p-3 sm:p-4 transition-all duration-300 hover:scale-105 flex flex-col items-center justify-center min-h-[140px] sm:min-h-[160px] w-full max-w-[220px] md:max-w-[240px] xl:max-w-[260px] ${
                        rank === 1 
                          ? 'border-2 border-yellow-400 shadow-lg shadow-yellow-400/20' 
                          : rank === 2 
                          ? 'border-2 border-gray-300 shadow-lg shadow-gray-300/20' 
                          : rank === 3 
                          ? 'border-2 border-amber-600 shadow-lg shadow-amber-600/20' 
                          : 'border-2 border-slate-500 shadow-lg shadow-slate-500/20'
                      }`}
                    >
                      {/* 상위 3명 프리미엄 오라/그라데이션 */}
                      {rank <= 3 && (
                        <div className={`pointer-events-none absolute -inset-px rounded-[0.75rem] blur-md opacity-90 ${
                          rank === 1
                            ? 'bg-gradient-to-r from-yellow-400/35 via-amber-300/25 to-yellow-400/35'
                            : rank === 2
                            ? 'bg-gradient-to-r from-zinc-100/35 via-slate-300/25 to-zinc-100/35'
                            : 'bg-gradient-to-r from-amber-600/35 via-orange-400/25 to-amber-600/35'
                        }`} />
                      )}

                      {/* 상위 3명 크라운 배지 */}
                      {rank <= 3 && (
                        <div className={`absolute -top-3 right-3 rounded-full p-1.5 shadow-md ${
                          rank === 1
                            ? 'bg-gradient-to-br from-yellow-400 to-amber-300'
                            : rank === 2
                            ? 'bg-gradient-to-br from-slate-200 to-slate-400'
                            : 'bg-gradient-to-br from-amber-600 to-orange-400'
                        }`}>
                          <Crown className={`w-4 h-4 ${rank === 2 ? 'text-slate-700' : 'text-black/80'}`} />
                        </div>
                      )}
                      {/* 순위 배지 */}
                      <div className="flex flex-col items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                        {rank > 3 ?
                        <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/10 flex items-center justify-center ${getRankColor(rank)} font-bold text-xs transition-colors group-hover:bg-white/20`}>
                          {rank}
                        </div>
                        :
                        getTrophyIcon(rank)
                        }
                      </div>

                      {/* 사용자 이름 */}
                      <div className="text-center">
                        <h3 className={`text-xs sm:text-sm font-semibold mb-1 ${rank <= 3 ? 'bg-clip-text text-transparent ' + (rank === 1 ? 'bg-gradient-to-r from-yellow-200 via-white to-yellow-200' : rank === 2 ? 'bg-gradient-to-r from-slate-200 via-white to-slate-200' : 'bg-gradient-to-r from-amber-300 via-white to-amber-300') : getRankColor(rank)}`}>
                          {item.name}
                        </h3>
                        {/* 추가 정보 */}
                        <div className="text-xs text-white/60 space-y-1">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xs">문제:</span>
                            <span className={`px-1 sm:px-2 py-1 rounded text-xs font-medium border ${getProblemCountColor(item.lastMonthSolved)}`}>
                              {item.lastMonthSolved}개
                            </span>
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xs">점수:</span>
                            <span className="text-green-400 font-medium text-xs">{item.lastMonthScore}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 하단 4명 */}
              <div className="grid grid-cols-4 gap-4 lg:gap-6">
                {rankList.slice(3, 7).map((item, index) => {
                  const rank = item.rank;
                  return (
                    <div
                      key={`bottom-${index}`}
                      className={`group relative bg-white/5 hover:bg-white/10 rounded-lg px-7 py-4 sm:px-8 sm:py-5 transition-all duration-300 hover:scale-105 flex flex-col items-center justify-center min-h-[150px] sm:min-h-[170px] w-full ${
                        rank === 1 
                          ? 'border-2 border-yellow-400 shadow-lg shadow-yellow-400/20' 
                          : rank === 2 
                          ? 'border-2 border-gray-300 shadow-lg shadow-gray-300/20' 
                          : rank === 3 
                          ? 'border-2 border-amber-600 shadow-lg shadow-amber-600/20' 
                          : 'border-2 border-slate-500 shadow-lg shadow-slate-500/20'
                      }`}
                    >
                      {/* 일반 카드도 약한 오라 */}
                      {rank > 3 && (
                        <div className="pointer-events-none absolute -inset-px rounded-[0.75rem] blur-sm opacity-50 bg-gradient-to-br from-blue-400/10 via-cyan-300/10 to-blue-400/10" />
                      )}
                      {/* 순위 배지 */}
                      <div className="flex flex-col items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                        {rank > 3 ?
                        <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/10 flex items-center justify-center ${getRankColor(rank)} font-bold text-xs transition-colors group-hover:bg-white/20`}>
                          {rank}
                        </div>
                        :
                        getTrophyIcon(rank)
                        }
                      </div>

                      {/* 사용자 이름 */}
                      <div className="text-center">
                        <h3 className={`text-xs sm:text-sm font-semibold ${getRankColor(rank)} mb-1`}>
                          {item.name}
                        </h3>
                        {/* 추가 정보 */}
                        <div className="text-xs text-white/60 space-y-1">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xs">문제:</span>
                            <span className={`px-1 sm:px-2 py-1 rounded text-xs font-medium border ${getProblemCountColor(item.lastMonthSolved)}`}>
                              {item.lastMonthSolved}개
                            </span>
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xs">점수:</span>
                            <span className="text-green-400 font-medium text-xs">{item.lastMonthScore}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 하단 설명 */}
          <div className="mt-4 text-center">
            <p className="text-white/50 text-xs">
                랭킹은 그 달의 마지막 추첨기록을 기준으로 결정됩니다.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LastMonthRanking;
