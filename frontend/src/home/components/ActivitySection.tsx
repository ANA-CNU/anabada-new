import { Target } from "lucide-react";
import ScoreRecordsTable from "./activity/ScoreRecordsTable";
import RecentProblemsTable from "./activity/RecentProblemsTable";
import MonthlyProblemsTable from "./activity/MonthlyProblemsTable";
import { dummyScoreRecords, dummyRecentProblems, dummyMonthlyProblems } from "./activity/dummyData";

function ActivitySection() {

  return (
    <div className="w-full px-4 py-4 md:px-6 md:py-6">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 md:mb-6 text-center flex items-center justify-center gap-2 md:gap-3">
          <Target className="w-6 h-6 md:w-8 md:h-8 text-blue-400" />
          실시간 활동 현황
        </h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <ScoreRecordsTable records={dummyScoreRecords} />
          <RecentProblemsTable problems={dummyRecentProblems} />
          <MonthlyProblemsTable problems={dummyMonthlyProblems} />
        </div>
      </div>
    </div>
  );
}

export default ActivitySection; 