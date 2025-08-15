import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { getProblemCountColor, type MonthlyProblem } from './types';
import { URL } from "@/resource/constant";

interface MonthlyProblemsTableProps {
  problems?: MonthlyProblem[];
}

interface ApiResponse {
  success: boolean;
  data: {
    username: string;
    tier: number;
    solved: number;
  }[];
  message: string;
}

function MonthlyProblemsTable({ problems: initialProblems }: MonthlyProblemsTableProps) {
  const [problems, setProblems] = useState<MonthlyProblem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMonthlyProblems = async () => {
      try {
        const response = await fetch(`${URL}/api/ranking/solved`);
        const result: ApiResponse = await response.json();
        
        if (result.success) {
          // API 응답을 MonthlyProblem 형식으로 변환
          const convertedProblems: MonthlyProblem[] = result.data.map((item, index) => ({
            id: (index + 1).toString(),
            user: item.username,
            problemCount: item.solved
          }));
          setProblems(convertedProblems);
        }
      } catch (error) {
        console.error('이번 달 문제 해결 데이터 가져오기 실패:', error);
        // API 실패 시 초기 데이터 사용
        if (initialProblems) {
          setProblems(initialProblems);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMonthlyProblems();
  }, [initialProblems]);
  return (
    <Card className="bg-white/5 backdrop-blur-md border-purple-400/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Calendar className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
          이번 달 문제 해결
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
              <TableHead className="text-white/70">이번 달 해결</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {problems.map((problem) => (
              <TableRow key={problem.id} className="border-white/10 hover:bg-white/5">
                <TableCell className="text-white font-medium">{problem.user}</TableCell>
                <TableCell>
                  <Badge className={getProblemCountColor(problem.problemCount)}>
                    {problem.problemCount}개
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default MonthlyProblemsTable; 