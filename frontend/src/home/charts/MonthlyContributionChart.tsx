import React, { useMemo, useCallback } from "react";
import { dummyStats } from "@/resource/dummy";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

function MonthlyContributionChart() {
  // 월별 데이터로 변환하고 누적 계산
  const monthlyData = useMemo(() => {
    const monthlyStats: { [key: string]: number } = {};
    
    // 날짜별 기여도를 월별로 그룹화
    dummyStats.forEach(stat => {
      const date = new Date(stat.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyStats[monthKey] = (monthlyStats[monthKey] || 0) + stat.contribution;
    });

    // 월별 데이터를 배열로 변환하고 누적 계산
    const sortedMonths = Object.keys(monthlyStats).sort();
    let cumulative = 0;
    
    return sortedMonths.map(month => {
      cumulative += monthlyStats[month];
      const [year, monthNum] = month.split('-');
      const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleDateString('ko-KR', { month: 'short' });
      
      return {
        month: monthName,
        contribution: monthlyStats[month],
        cumulative: cumulative,
        fullMonth: month
      };
    });
  }, []);

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
            이번 달 기여: {formatNumber(payload[0].payload.contribution)}개
          </p>
          <p className="text-sm text-blue-400">
            누적 기여: {formatNumber(payload[0].payload.cumulative)}개
          </p>
        </div>
      );
    }
    return null;
  }, [formatNumber]);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-full">
        <h3 className="text-white text-lg font-semibold mb-4 text-center">월별 기여도</h3>
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