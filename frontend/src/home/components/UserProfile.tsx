import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { ArrowLeft, Trophy, Target, TrendingUp, Calendar, ExternalLink } from 'lucide-react';
import { URL } from '@/resource/constant';
import UserRankHistoryChart from './UserRankHistoryChart';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import Background from '../stats/Background';
import { useNavigate, useParams } from 'react-router-dom';
import { StatCard } from '../../components/ui/stat-card';
import type { 
  User, 
  ScoreHistory, 
  Problem, 
  RankPoint, 
  MonthlySummary 
} from '../../types';
import { 
  getTierName, 
  getTierColor, 
  formatDate, 
  calculateAccuracy, 
  calculateAverageScore 
} from '../../lib/utils';

const UserProfile: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [user, setUser] = useState<User | null>(null);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistory[]>([]);
  const [recentProblems, setRecentProblems] = useState<Problem[]>([]);
  const [rankHistory, setRankHistory] = useState<RankPoint[]>([]);
  const [monthly, setMonthly] = useState<MonthlySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        const userRes = await fetch(`${URL}/api/users/${id}`);
        if (userRes.ok) {
          const json = await userRes.json();
          setUser(json.data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    if (id) fetchAll();
  }, [id]);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;
      try {
        // 점수 히스토리
        const historyResponse = await fetch(`${URL}/api/score_history/user/${user.id}`);
        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          setScoreHistory(historyData);
        }

        // 최근 문제
        const problemsResponse = await fetch(`${URL}/api/user/${user.id}/problems`);
        if (problemsResponse.ok) {
          const problemsData = await problemsResponse.json();
          setRecentProblems(problemsData);
        }

        // 랭킹 히스토리
        const rankRes = await fetch(`${URL}/api/board/user/${user.id}/rank-history`);
        if (rankRes.ok) {
          const rankData = await rankRes.json();
          setRankHistory(rankData);
        }

        // 월별 요약
        const monthlyRes = await fetch(`${URL}/api/user/${user.id}/monthly-summary`);
        if (monthlyRes.ok) {
          const monthlyData = await monthlyRes.json();
          setMonthly(monthlyData['data']);
        } else {
          console.error('월별 요약 API 오류:', monthlyRes.status, monthlyRes.statusText);
        }
      } catch (error) {
        console.error('사용자 데이터 로딩 중 오류:', error);
      }
    };

    fetchUserData();
  }, [user?.id]);

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

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0a1026] flex items-center justify-center text-white">
        로딩 중...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1026]">
      <Background>
        <div className="max-w-6xl mx-auto p-6">
          {/* 헤더 */}
          <div className="flex items-center gap-4 mb-8">
            <Button
              onClick={() => navigate('/')}
              variant="ghost"
              className="text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              뒤로 가기
            </Button>
            <h1 className="text-3xl font-bold text-white">사용자 프로필</h1>
          </div>

          {/* 사용자 기본 정보 */}
          <Card className="bg-white/5 border-white/20 text-white mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl flex items-center gap-3">
                    {user.name}
                    {user.kr_name && (
                      <span className="text-lg text-gray-300">({user.kr_name})</span>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-4 mt-2">
                    <Badge className={`text-lg px-3 py-1 ${getTierColor(user.tier)} bg-transparent border-current`}>
                      {getTierName(user.tier)} (Tier {user.tier})
                    </Badge>
                    {user.atcoder_handle && (
                      <a
                        href={`https://atcoder.jp/users/${user.atcoder_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                      >
                        <ExternalLink className="w-4 h-4" />
                        AtCoder
                      </a>
                    )}
                    {user.codeforces_handle && (
                      <a
                        href={`https://codeforces.com/profile/${user.codeforces_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Codeforces
                      </a>
                    )}
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
              value={calculateAverageScore(scoreHistory)}
              label="평균 점수"
              iconColor="text-purple-400"
            />
          </div>

          {/* 랭킹 변화 차트 */}
          <div className="mb-8">
            <UserRankHistoryChart userId={user.id} />
          </div>

          {/* 이번 달 요약 */}
          {monthly && (
            <Card className="bg-white/5 border-white/20 text-white mb-8">
              <CardHeader>
                <CardTitle className="text-xl">이번 달 요약 ({monthly.start_date} ~ {monthly.end_date})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 이번 달 푼 문제 */}
                  <div className="p-6 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-4">
                      <Target className="w-12 h-12 text-green-400" />
                      <div>
                        <div className="text-gray-300 text-sm">이번 달 푼 문제</div>
                        <div className="text-3xl font-bold text-green-400">{monthly.total_solved || 0}문제</div>
                      </div>
                    </div>
                  </div>

                  {/* 이번 달 점수 합 */}
                  <div className="p-6 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-4">
                      <TrendingUp className="w-12 h-12 text-blue-400" />
                      <div>
                        <div className="text-gray-300 text-sm">이번 달 점수 합</div>
                        <div className="text-3xl font-bold text-blue-400">{monthly.total_score || 0}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 랭킹 분포: 바차트 + 확률 테이블 (2컬럼) */}
          <Card className="bg-white/5 border-white/20 text-white mb-8">
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
                      <Tooltip contentStyle={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }} />
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
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 최근 점수 기록 */}
            <Card className="bg-white/5 border-white/20 text-white">
              <CardHeader>
                <CardTitle className="text-xl">최근 점수 기록</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto no-scrollbar">
                  {scoreHistory.slice(0, 10).map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="text-sm text-gray-300">{record.desc}</div>
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
                    </div>
                  ))}
                  {scoreHistory.length === 0 && (
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
                    <div
                      key={problem.id}
                      className="p-3 bg-white/5 rounded-lg"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{problem.name}</div>
                          <div className="text-sm text-gray-300">
                            Difficulty {problem.level} • Problem Tier {problem.problem_tier}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-400">
                            {formatDate(problem.time)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {recentProblems.length === 0 && (
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
