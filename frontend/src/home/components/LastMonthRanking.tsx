import React, { useEffect, useState } from 'react';
import { Trophy, TrendingUp, Calendar } from 'lucide-react';
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
    if (rank === 1) return <Trophy className="w-4 h-4 text-yellow-400" />;
    if (rank === 2) return <Trophy className="w-4 h-4 text-gray-300" />;
    if (rank === 3) return <Trophy className="w-4 h-4 text-amber-600" />;
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
      <div className="max-w-6xl mx-auto">
        {/* 섹션 헤더 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Calendar className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl lg:text-3xl font-bold text-white">
              지난 달 최종 추첨 결과
            </h2>
          </div>
          <p className="text-white/70 text-base max-w-2xl mx-auto">
            지난 달 가중치를 고려하여 최종적으로 추첨된 사용자들입니다.
          </p>
        </div>

        {/* 랭킹 리스트 */}
        <div className="bg-black/20 backdrop-blur-md border border-white/10 rounded-2xl p-3 sm:p-4 lg:p-6">
          {isLoading ? (
            // 로딩 스켈레톤
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2 lg:gap-3">
              {Array.from({ length: 7 }).map((_, index) => (
                <div
                  key={index}
                  className="group relative bg-white/5 rounded-lg p-2 sm:p-3 flex flex-col items-center justify-center min-h-[120px] sm:min-h-[140px] animate-pulse"
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
            // 실제 데이터 표시
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2 lg:gap-3">
              {rankList.map((item, index) => {
                const rank = item.rank;
                return (
                  <div
                    key={index}
                    className={`group relative bg-white/5 hover:bg-white/10 rounded-lg p-2 sm:p-3 transition-all duration-300 hover:scale-105 flex flex-col items-center justify-center min-h-[120px] sm:min-h-[140px] ${
                      rank === 1 
                        ? 'border-2 border-yellow-400 shadow-lg shadow-yellow-400/20' 
                        : rank === 2 
                        ? 'border-2 border-gray-300 shadow-lg shadow-gray-300/20' 
                        : rank === 3 
                        ? 'border-2 border-amber-600 shadow-lg shadow-amber-600/20' 
                        : 'border-2 border-slate-500 shadow-lg shadow-slate-500/20'
                    }`}
                  >
                    {/* 순위 배지 */}
                    <div className="flex flex-col items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                      {rank > 3 ?
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/10 flex items-center justify-center ${getRankColor(rank)} font-bold text-xs`}>
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
