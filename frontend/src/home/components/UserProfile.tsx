"use client";

import { ChartTooltip } from "./ChartTooltip";
import { ScoreReasonText } from "@/components/ScoreReasonText";
import { SquircleSurface } from "@/components/ui/squircle";
import React from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { ArrowLeft, Trophy, Target, TrendingUp, Calendar } from 'lucide-react';
import UserRankHistoryChart from './UserRankHistoryChart';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import Background from '../stats/Background';
import Link from 'next/link';
import { StatCard } from '../../components/ui/stat-card';
import type { 
  User, 
  RecentScore,
  Problem, 
  RankPoint, 
  MonthlySummary 
} from '../../types';
import { 
  getTierName, 
  getTierColor, 
  formatDate, 
  calculateAccuracy
} from '../../lib/utils';

export type ProfileActivity = {
  scores: RecentScore[] | null;
  problems: Problem[] | null;
  ranks: RankPoint[] | null;
  monthly: MonthlySummary | null;
};

type ProfileProps = {
  readonly initialUser: User;
  readonly initialActivity: ProfileActivity;
};

const UserProfile = ({ initialUser: user, initialActivity: activity }: ProfileProps) => {
  const scoreHistory = activity.scores ?? [];
  const recentProblems = activity.problems ?? [];
  const rankHistory = activity.ranks ?? [];
  const monthly = activity.monthly;

  // 랭크 분포 및 확률 계산 (1~8위 + 9위 이상)
  const rankCounts: Record<string, number> = {};
  for (let i = 1; i <= 8; i++) rankCounts[`${i}위`] = 0;
  let others = 0;
  
  rankHistory.forEach(r => {
    if (r.rank >= 1 && r.rank <= 8) rankCounts[`${r.rank}위`] += 1;
    else others += 1;
  });
  
  const totalRanks = rankHistory.length || 1;
  const tableRows = (
    [...Array(8)].map((_, idx) => {
      const label = `${idx + 1}위`;
      const count = rankCounts[label];
      const prob = (count / totalRanks) * 100;
      return { label, count, prob: Number.isFinite(prob) ? prob : 0 };
    })
  ).concat([{ 
    label: '9위+', 
    count: others, 
    prob: Number.isFinite((others / totalRanks) * 100) ? (others / totalRanks) * 100 : 0 
  }]);

  const barData = tableRows.map(r => ({ label: r.label, count: r.count }));


  return (
    <div className="min-h-screen bg-[#0a1026]">
      <Background>
        <div className="max-w-6xl mx-auto p-6">
          {/* 헤더 */}
          <div className="flex items-center gap-4 mb-8">
            <Button asChild variant="ghost" className="text-white hover:bg-white/10">
              <Link href="/">
                <ArrowLeft className="w-5 h-5 mr-2" aria-hidden="true" />
                홈으로
              </Link>
            </Button>
            <h1 className="text-3xl font-bold text-white">사용자 프로필</h1>
          </div>

          {/* 사용자 기본 정보 */}
          <Card className="bg-white/5 border-white/20 text-white mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="min-w-0 w-full">
                  <CardTitle className="text-2xl flex flex-wrap items-center gap-3">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{user.jungol_name}</span>
                    {user.korean_name && (
                      <span className="min-w-0 text-lg text-gray-300 break-keep [overflow-wrap:anywhere]">({user.korean_name})</span>
                    )}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-4 mt-2">
                    <Badge className={`text-lg px-3 py-1 ${getTierColor(user.tier)} bg-transparent border-current`}>
                      {getTierName(user.tier)} (Tier {user.tier})
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* 통계 카드들 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              icon={Target}
              value={user.corrects}
              label="정답 수"
              iconColor="text-blue-400"
            />
            <StatCard
              icon={TrendingUp}
              value={`${calculateAccuracy(user.corrects, user.submissions)}%`}
              label="정답률"
              iconColor="text-green-400"
            />
            <StatCard
              icon={Trophy}
              value={user.solution}
              label="최근 제출 번호"
              iconColor="text-yellow-400"
            />
            <StatCard
              icon={Calendar}
              value={activity?.scores ? (scoreHistory.length ? Number((scoreHistory.reduce((sum, record) => sum + record.bias, 0) / scoreHistory.length).toFixed(1)) : 0) : "—"}
              label="평균 점수"
              iconColor="text-purple-400"
            />
          </div>


          {activity?.ranks && (
            <div className="mb-8">
              <UserRankHistoryChart data={rankHistory} />
            </div>
          )}
          {activity?.ranks === null && (
            <p role="alert" className="mb-8 text-gray-300">순위 기록을 불러오지 못했습니다.</p>
          )}

          {/* 이번 달 요약 */}
          {monthly === null && (
            <p role="alert" className="mb-8 text-gray-300">이번 달 요약을 불러오지 못했습니다.</p>
          )}
          {monthly && (
            <Card className="bg-white/5 border-white/20 text-white mb-8">
              <CardHeader>
                <CardTitle className="flex flex-col gap-1 text-lg sm:flex-row sm:items-baseline sm:gap-2 sm:text-xl">
                  <span className="break-keep">이번 달 요약</span>
                  <span className="whitespace-nowrap text-base sm:text-xl">({monthly.start_date} ~ {monthly.end_date})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 이번 달 푼 문제 */}
                  <SquircleSurface radius="surface" className="p-6 bg-white/5 border border-white/10">
                    <div className="flex items-center gap-4">
                      <Target className="w-12 h-12 text-green-400" />
                      <div>
                        <div className="text-gray-300 text-sm">이번 달 푼 문제</div>
                        <div className="text-3xl font-bold text-green-400">{monthly.total_solved || 0}문제</div>
                      </div>
                    </div>
                  </SquircleSurface>

                  {/* 이번 달 점수 합 */}
                  <SquircleSurface radius="surface" className="p-6 bg-white/5 border border-white/10">
                    <div className="flex items-center gap-4">
                      <TrendingUp className="w-12 h-12 text-blue-400" />
                      <div>
                        <div className="text-gray-300 text-sm">이번 달 점수 합</div>
                        <div className="text-3xl font-bold text-blue-400">{monthly.total_score || 0}</div>
                      </div>
                    </div>
                  </SquircleSurface>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 랭킹 분포: 바차트 + 확률 테이블 (2컬럼) */}
          {activity?.ranks && <Card className="bg-white/5 border-white/20 text-white mb-8">
            <CardHeader>
              <CardTitle className="text-xl">순위별 분포 및 확률</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 좌측: 바 차트 */}
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.2)' }} />
                      <YAxis allowDecimals={false} tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.2)' }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 우측: 테이블 */}
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="text-gray-300 border-b border-white/10">
                        <th className="py-2 pr-4">순위</th>
                        <th className="py-2 pr-4">횟수</th>
                        <th className="py-2">확률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((r) => (
                        <tr key={r.label} className="border-b border-white/5">
                          <td className="py-2 pr-4 text-white">{r.label}</td>
                          <td className="py-2 pr-4 text-gray-300">{r.count}</td>
                          <td className="py-2 text-blue-300">{r.prob.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 최근 점수 기록 */}
            <Card className="bg-white/5 border-white/20 text-white">
              <CardHeader>
                <CardTitle className="text-xl">최근 점수 기록</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto no-scrollbar">
                  {scoreHistory.slice(0, 10).map((record) => (
                    <SquircleSurface radius="surface"
                      key={record.id}
                      className="flex items-center justify-between p-3 bg-white/5"
                    >
                      <div className="flex-1">
                        <div className="text-sm text-gray-300"><ScoreReasonText>{record.desc}</ScoreReasonText></div>
                        <div className="text-xs text-gray-400">
                          {formatDate(record.created_at)}
                        </div>
                      </div>
                      <Badge
                        variant={record.bias >= 0 ? "default" : "destructive"}
                        className="ml-2"
                      >
                        {record.bias >= 0 ? '+' : ''}{record.bias}
                      </Badge>
                    </SquircleSurface>
                  ))}
                  {activity?.scores === null && (
                    <p role="alert" className="text-center text-gray-300 py-8">점수 기록을 불러오지 못했습니다.</p>
                  )}
                  {activity?.scores?.length === 0 && (
                    <div className="text-center text-gray-400 py-8">
                      점수 기록이 없습니다.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 최근 해결한 문제 */}
            <Card className="bg-white/5 border-white/20 text-white">
              <CardHeader>
                <CardTitle className="text-xl">최근 해결한 문제</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto no-scrollbar">
                  {recentProblems.slice(0, 10).map((problem) => (
                    <SquircleSurface radius="surface"
                      key={problem.id}
                      className="p-3 bg-white/5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <a className="font-medium hover:underline"
                            href={`https://www.acmicpc.net/problem/${problem.problem}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {problem.problem_name ?? `백준 #${problem.problem}`}
                          </a>
                          <div className="text-sm text-gray-300">
                            Difficulty {problem.level} • Problem Tier {problem.problem_tier}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-400">
                            {formatDate(problem.submitted_at)}
                          </div>
                        </div>
                      </div>
                    </SquircleSurface>
                  ))}
                  {activity?.problems === null && (
                    <p role="alert" className="text-center text-gray-300 py-8">문제 풀이 기록을 불러오지 못했습니다.</p>
                  )}
                  {activity?.problems?.length === 0 && (
                    <div className="text-center text-gray-400 py-8">
                      해결한 문제가 없습니다.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </Background>
    </div>
  );
};

export default UserProfile;
