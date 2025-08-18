import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { getProblemCountColor, getTotalSolvedColor, type MonthlyProblem } from './types';
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
    total_solved: number;
  }[];
  message: string;
}

// 테이블 전용 확장 타입 (누적 포함)
interface MonthlyProblemRow {
  id: string;
  user: string;
  problemCount: number;
  totalSolved: number;
}

function MonthlyProblemsTable({ problems: initialProblems }: MonthlyProblemsTableProps) {
  const [problems, setProblems] = useState<MonthlyProblemRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMonthlyProblems = async () => {
      try {
        const response = await fetch(`${URL}/api/ranking/monthly-solved`);
        const result: ApiResponse = await response.json();
        
        if (result.success) {
          // API 응답을 테이블용 형식으로 변환
          const convertedProblems: MonthlyProblemRow[] = result.data.map((item, index) => ({
            id: (index + 1).toString(),
            user: item.username,
            problemCount: item.solved,
            totalSolved: item.total_solved,
          }));
          setProblems(convertedProblems);
        }
      } catch (error) {
        console.error('이번 달 문제 해결 데이터 가져오기 실패:', error);
        // API 실패 시 초기 데이터 사용
        if (initialProblems) {
          setProblems(
            initialProblems.map((p, idx) => ({
              id: p.id ?? String(idx + 1),
              user: p.user,
              problemCount: p.problemCount,
              totalSolved: 0,
            }))
          );
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMonthlyProblems();
  }, [initialProblems]);

  
  //디버그 시에만 사용 하길 바람 그외에는 주석 처리해서 commit.
  // const isDebug = process.env.NODE_ENV === 'development';
  const isDebug = false;

  const displayProblems = useMemo(() => {
    if (!isDebug) return problems;
    const debugTotals = [3000, 2500, 2000, 1500, 1400, 1300, 1200, 1100, 1000, 900, 650, 400, 200, 100, 50];
    return problems.map((p, idx) => idx < debugTotals.length ? { ...p, totalSolved: debugTotals[idx] } : p);
  }, [problems, isDebug]);

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
              <TableHead className="text-white/70">누적 해결</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayProblems.map((problem) => (
              <TableRow key={problem.id} className="border-white/10 hover:bg-white/5">
                <TableCell className="text-white font-medium">{problem.user}</TableCell>
                <TableCell>
                  <Badge className={getProblemCountColor(problem.problemCount)}>
                    {problem.problemCount}개
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={getTotalSolvedColor(problem.totalSolved)}>
                    {problem.totalSolved}개
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