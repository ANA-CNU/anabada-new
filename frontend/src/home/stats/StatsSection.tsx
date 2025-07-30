import React from "react";
import MonthlyContributionChart from "../charts/MonthlyContributionChart";
import ContributionStats from "../components/ContributionStats";

const StatsSection = React.memo(() => {
  return (
    <div className="w-full h-min flex flex-col items-center justify-center px-8 mb-10">
      <div className="w-full flex flex-col md:flex-row">
        {/* 왼쪽 - 그래프 영역 (65%) / 아래쪽 (모바일) */}
        <div className="w-full md:w-[65%] h-full md:h-full md:order-1 order-2">
          <MonthlyContributionChart />
        </div>
        
        {/* 오른쪽 - 통계 영역 (35%) / 위쪽 (모바일) */}
        <div className="w-full md:w-[35%] h-full md:h-auto md:order-2 order-1">
          <ContributionStats />
        </div>
      </div>
    </div>
  );
});

StatsSection.displayName = 'StatsSection';

export default StatsSection; 