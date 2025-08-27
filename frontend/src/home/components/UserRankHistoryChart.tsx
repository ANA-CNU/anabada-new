import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { URL } from '@/resource/constant';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, BarChart, Bar } from 'recharts';

interface RankPoint {
  board_id: number;
  created_at: string;
  rank: number;
}

interface Props {
  userId: number;
}

const UserRankHistoryChart: React.FC<Props> = ({ userId }) => {
  const [data, setData] = useState<RankPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${URL}/api/board/user/${userId}/rank-history`);
        if (res.ok) {
          const json = await res.json();
          setData(Array.isArray(json) ? json : json.data || []);
        }
      } catch (e) {
        console.error('랭킹 히스토리 로딩 실패', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userId]);

  const chartData = useMemo(() => {
    // 전체 데이터를 모두 표시 + 숫자형 타임스탬프 추가
    return data.map(d => {
      const ts = new Date(d.created_at).getTime();
      return {
        date: new Date(d.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
        rank: d.rank,
        fullDate: new Date(d.created_at).toLocaleDateString('ko-KR'),
        boardId: d.board_id,
        timestamp: d.created_at,
        ts,
      };
    });
  }, [data]);

  // 통계 계산
  const stats = useMemo(() => {
    if (data.length === 0) {
      return { avg: 0, best: 0, worst: 0, rank1Count: 0, top3Ratio: 0, improved: 0 };
    }
    const ranks = data.map(d => d.rank);
    const total = ranks.reduce((a, b) => a + b, 0);
    const avg = total / ranks.length;
    const best = Math.min(...ranks);
    const worst = Math.max(...ranks);
    const rank1Count = ranks.filter(r => r === 1).length;
    const top3Ratio = (ranks.filter(r => r <= 3).length / ranks.length) * 100;
    const improved = ranks[0] - ranks[ranks.length - 1]; // +면 향상
    return { avg, best, worst, rank1Count, top3Ratio, improved };
  }, [data]);

  const distData = useMemo(() => {
    if (data.length === 0) return [] as { label: string; count: number }[];
    const buckets = { '1위': 0, '2-3위': 0, '4-10위': 0, '11위+': 0 } as Record<string, number>;
    for (const d of data) {
      if (d.rank === 1) buckets['1위']++;
      else if (d.rank <= 3) buckets['2-3위']++;
      else if (d.rank <= 10) buckets['4-10위']++;
      else buckets['11위+']++;
    }
    return Object.entries(buckets).map(([label, count]) => ({ label, count }));
  }, [data]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-black/80 border border-white/20 rounded-lg p-3 text-white">
          <p className="font-medium">날짜: {d.fullDate}</p>
          <p className="text-blue-400">랭킹: {d.rank}위</p>
          <p className="text-gray-300 text-sm">보드 ID: {d.boardId}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="bg-white/5 border-white/20 text-white">
      <CardHeader>
        <CardTitle className="text-xl">랭킹 변화 ({data.length}개 데이터)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-gray-300">로딩 중...</div>
        ) : chartData.length === 0 ? (
          <div className="text-gray-400">랭킹 데이터가 없습니다.</div>
        ) : (
          <>
            {/* 통계 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-gray-400 text-xs">평균 순위</div>
                <div className="text-2xl font-semibold">{stats.avg.toFixed(1)}위</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-gray-400 text-xs">1위 달성</div>
                <div className="text-2xl font-semibold text-yellow-300">{stats.rank1Count}회</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-gray-400 text-xs">TOP 3 비율</div>
                <div className="text-2xl font-semibold text-green-300">{stats.top3Ratio.toFixed(0)}%</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-gray-400 text-xs">최고 / 최저</div>
                <div className="text-2xl font-semibold"><span className="text-blue-300">{stats.best}위</span> / <span className="text-red-300">{stats.worst}위</span></div>
              </div>
            </div>

            {/* 라인 차트 */}
            <div className="h-80 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 24, left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                    height={40}
                  />
                  <YAxis
                    reversed
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                    tickFormatter={(value) => `${value}위`}
                  />
                  {/* 평균 기준선 */}
                  <ReferenceLine y={stats.avg} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: `평균 ${stats.avg.toFixed(1)}위`, position: 'insideTopRight', fill: '#fbbf24', fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="rank"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, stroke: '#60a5fa', strokeWidth: 2 }}
                    isAnimationActive={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 랭킹 분포 바 차트 */}
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.2)' }} />
                  <YAxis allowDecimals={false} tick={{ fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.2)' }} />
                  <Tooltip contentStyle={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }} />
                  <Bar dataKey="count" fill="#34d399" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default UserRankHistoryChart;
