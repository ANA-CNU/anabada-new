import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import type { RecentProblem } from './types';
import { formatRelativeTime, formatExactTime } from './types';
import { URL } from "@/resource/constant";

interface RecentProblemsTableProps {
  problems?: RecentProblem[];
}

interface ApiResponse {
  success: boolean;
  data: {
    username: string;
    problem: number;
    solvedAt: string;
  }[];
  message: string;
}


function RecentProblemsTable({ problems: initialProblems }: RecentProblemsTableProps) {
  const [problems, setProblems] = useState<RecentProblem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecentProblems = async () => {
      try {
        const response = await fetch(`${URL}/api/statistics/recently-solved`);
        const result: ApiResponse = await response.json();
        
        if (result.success) {
          // API 응답을 RecentProblem 형식으로 변환
          const convertedProblems: RecentProblem[] = result.data.map((item, index) => ({
            id: (index + 1).toString(),
            user: item.username,
            problemNumber: item.problem,
            solvedAt: item.solvedAt
          }));
          setProblems(convertedProblems);
        }
      } catch (error) {
        console.error('최근 해결한 문제 데이터 가져오기 실패:', error);
        // API 실패 시 초기 데이터 사용
        if (initialProblems) {
          setProblems(initialProblems);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRecentProblems();
  }, [initialProblems]);

  if (loading) {
    return (
      <Card className="bg-white/5 backdrop-blur-md border-green-400/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Clock className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
            최근 해결한 문제
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[350px]">
          <div className="text-white">데이터 로딩 중...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/5 backdrop-blur-md border-green-400/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Clock className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
          최근 해결한 문제
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-transparent scrollbar-track-transparent p-3 px-7" style={{ scrollbarColor: 'transparent transparent', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style>{`
          .scrollbar-thin::-webkit-scrollbar {
            width: 0px !important;
            background: transparent !important;
            display: none !important;
          }
          .scrollbar-thin::-webkit-scrollbar-thumb {
            background: transparent !important;
            display: none !important;
          }
          .scrollbar-thin::-webkit-scrollbar-track {
            background: transparent !important;
            display: none !important;
          }
          .scrollbar-thin::-webkit-scrollbar-corner {
            background: transparent !important;
            display: none !important;
          }
          .scrollbar-thin::-webkit-scrollbar-button {
            display: none !important;
          }
          .scrollbar-thin::-webkit-scrollbar-track-piece {
            background: transparent !important;
            display: none !important;
          }
          .scrollbar-thin {
            -webkit-overflow-scrolling: touch;
          }
          .scrollbar-thin::-webkit-scrollbar {
            -webkit-appearance: none;
            width: 0 !important;
            height: 0 !important;
          }
        `}</style>
        <Table>
          <TableHeader>
            <TableRow className="border-white/10">
              <TableHead className="text-white/70">유저</TableHead>
              <TableHead className="text-white/70">문제</TableHead>
              <TableHead className="text-white/70">해결 시간</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {problems.map((problem) => (
              <TableRow key={problem.id} className="border-white/10 hover:bg-white/5">
                <TableCell className="text-white font-medium">{problem.user}</TableCell>
                <TableCell>
                  <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                    #{problem.problemNumber}
                  </Badge>
                </TableCell>
                <TableCell className="text-white/60 text-xs">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help hover:text-white/80 transition-colors">
                        {formatRelativeTime(problem.solvedAt)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-sm">
                        <div className="font-semibold">정확한 시간:</div>
                        <div className="text-xs text-gray-300">
                          {formatExactTime(problem.solvedAt)}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default RecentProblemsTable; 