import { URL } from "@/resource/constant";
import React, { useMemo, useCallback, useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface MonthlyData {
  date: string;
  solved_problem: number;
}

function MonthlyContributionChart() {
  const [monthlyStats, setMonthlyStats] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMonthlyStats = async () => {
      try {
        const response = await fetch(`${URL}/api/statistics/monthly-problems`);
        const result = await response.json();
        
        if (result.success) {
          setMonthlyStats(result.data);
        }
      } catch (error) {
        console.error('월별 통계 데이터 가져오기 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMonthlyStats();
  }, []);

  // 월별 데이터로 변환하고 누적 계산
  const monthlyData = useMemo(() => {
    if (monthlyStats.length === 0) return [];

    // API 데이터를 차트용으로 변환하고 누적 계산
    let cumulative = 0;
    
    return monthlyStats.map(stat => {
      cumulative += stat.solved_problem;
      const [year, monthNum] = stat.date.split('-');
      const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleDateString('ko-KR', { month: 'short' });
      
      return {
        month: monthName,
        contribution: stat.solved_problem,
        cumulative: cumulative,
        fullMonth: stat.date
      };
    });
  }, [monthlyStats]);

  // 숫자 포맷팅 함수 (3자리마다 쉼표) - useCallback으로 최적화
  const formatNumber = useCallback((num: number) => {
    return num.toLocaleString('ko-KR');
  }, []);

  // Y축 범위 계산 (최대값의 30% 정도 아래에서 시작)
  const yAxisDomain = useMemo(() => {
    const maxValue = Math.max(...monthlyData.map(d => d.cumulative));
    const minValue = Math.min(...monthlyData.map(d => d.cumulative));
    const range = maxValue - minValue;
    const padding = range * 0.3; // 30% 패딩
    
    return [Math.max(0, minValue - padding), maxValue + padding];
  }, [monthlyData]);

  // 툴팁 커스터마이징 - useCallback으로 최적화
  const CustomTooltip = useCallback(({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/90 border border-gray-700 rounded-lg p-3 text-white">
          <p className="font-semibold">{label}</p>
          <p className="text-sm text-gray-300">
            이번 달 해결: {formatNumber(payload[0].payload.contribution)}문제
          </p>
          <p className="text-sm text-blue-400">
            누적 해결: {formatNumber(payload[0].payload.cumulative)}문제
          </p>
        </div>
      );
    }
    return null;
  }, [formatNumber]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-white">데이터 로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-full">
        <h3 className="text-white text-lg font-semibold mb-4 text-center">월별 문제 해결 통계</h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <defs>
              <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="rgba(255,255,255,0.1)" 
              vertical={false}
            />
            <XAxis 
              dataKey="month" 
              stroke="rgba(255,255,255,0.6)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
            />
            <YAxis 
              stroke="rgba(255,255,255,0.6)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              domain={yAxisDomain}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey="cumulative" 
              stroke="#0ea5e9" 
              strokeWidth={3}
              fill="url(#colorCumulative)"
              dot={{ fill: '#0ea5e9', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: '#0ea5e9', strokeWidth: 2, fill: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default MonthlyContributionChart; 