import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy, Clock, Calendar, Target } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ScoreRecord {
  id: string;
  user: string;
  reason: string;
  score: number;
  time: string;
}

interface RecentProblem {
  id: string;
  user: string;
  problemNumber: number;
  solvedAt: string;
}

interface MonthlyProblem {
  id: string;
  user: string;
  problemCount: number;
}

// Dummy 데이터
const dummyScoreRecords: ScoreRecord[] = [
  {
    id: "1",
    user: "algo_master",
    reason: "문제 1001 해결",
    score: 150,
    time: "2024-01-20T14:30:00Z",
  },
  {
    id: "2",
    user: "coding_ninja",
    reason: "문제 1002 해결",
    score: 200,
    time: "2024-01-20T13:45:00Z",
  },
  {
    id: "3",
    user: "problem_solver",
    reason: "문제 1003 해결",
    score: 180,
    time: "2024-01-20T12:20:00Z",
  },
  {
    id: "4",
    user: "code_wizard",
    reason: "문제 1004 해결",
    score: 250,
    time: "2024-01-20T11:15:00Z",
  },
  {
    id: "5",
    user: "algorithm_expert",
    reason: "문제 1005 해결",
    score: 300,
    time: "2024-01-20T10:30:00Z",
  },
  {
    id: "6",
    user: "code_master",
    reason: "문제 1006 해결",
    score: 220,
    time: "2024-01-19T16:20:00Z",
  },
  {
    id: "7",
    user: "algo_ninja",
    reason: "문제 1007 해결",
    score: 280,
    time: "2024-01-18T09:15:00Z",
  },
];

const dummyRecentProblems: RecentProblem[] = [
  {
    id: "1",
    user: "algo_master",
    problemNumber: 1001,
    solvedAt: "2024-01-20T14:30:00Z",
  },
  {
    id: "2",
    user: "coding_ninja",
    problemNumber: 1002,
    solvedAt: "2024-01-20T13:45:00Z",
  },
  {
    id: "3",
    user: "problem_solver",
    problemNumber: 1003,
    solvedAt: "2024-01-20T12:20:00Z",
  },
  {
    id: "4",
    user: "code_wizard",
    problemNumber: 1004,
    solvedAt: "2024-01-20T11:15:00Z",
  },
  {
    id: "5",
    user: "algorithm_expert",
    problemNumber: 1005,
    solvedAt: "2024-01-20T10:30:00Z",
  },
];

const dummyMonthlyProblems: MonthlyProblem[] = [
  {
    id: "1",
    user: "algo_master",
    problemCount: 45,
  },
  {
    id: "2",
    user: "coding_ninja",
    problemCount: 38,
  },
  {
    id: "3",
    user: "problem_solver",
    problemCount: 32,
  },
  {
    id: "4",
    user: "code_wizard",
    problemCount: 28,
  },
  {
    id: "5",
    user: "algorithm_expert",
    problemCount: 25,
  },
];

function ActivitySection() {
  const formatRelativeTime = (timeString: string) => {
    const now = new Date();
    const time = new Date(timeString);
    const diffInMs = now.getTime() - time.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 1) return "방금 전";
    if (diffInMinutes < 60) return `${diffInMinutes}분 전`;
    if (diffInHours < 24) return `${diffInHours}시간 전`;
    if (diffInDays < 7) return `${diffInDays}일 전`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}주 전`;
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)}개월 전`;
    return `${Math.floor(diffInDays / 365)}년 전`;
  };

  const formatExactTime = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatMonth = (monthString: string) => {
    const [year, month] = monthString.split('-');
    return `${year}년 ${month}월`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 250) return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    if (score >= 200) return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    if (score >= 150) return "bg-green-500/20 text-green-300 border-green-500/30";
    return "bg-gray-500/20 text-gray-300 border-gray-500/30";
  };

  return (
    <div className="w-full px-4 py-4 md:px-6 md:py-6">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 md:mb-6 text-center flex items-center justify-center gap-2 md:gap-3">
          <Target className="w-6 h-6 md:w-8 md:h-8 text-blue-400" />
          실시간 활동 현황
        </h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* 점수 획득 기록 */}
          <Card className="bg-white/5 backdrop-blur-md border-blue-400/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 md:w-5 md:h-5 text-yellow-400" />
                최근 점수 획득
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[250px] md:max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-transparent scrollbar-track-transparent p-3 px-7" style={{ scrollbarColor: 'transparent transparent', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
                /* 사파리 전용 스크롤바 숨김 */
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
                    <TableHead className="text-white/70">점수</TableHead>
                    <TableHead className="text-white/70">시간</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dummyScoreRecords.map((record) => (
                    <Tooltip key={record.id}>
                      <TooltipTrigger asChild>
                        <TableRow className="border-white/10 hover:bg-white/5 cursor-help">
                          <TableCell className="text-white font-medium">{record.user}</TableCell>
                          <TableCell>
                            <Badge className={getScoreColor(record.score)}>
                              +{record.score}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-white/60 text-xs">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help hover:text-white/80 transition-colors">
                                  {formatRelativeTime(record.time)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-sm">
                                  <div className="font-semibold">정확한 시간:</div>
                                  <div className="text-xs text-gray-300">
                                    {formatExactTime(record.time)}
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-sm">
                          <div className="font-semibold">획득 이유:</div>
                          <div className="text-xs text-gray-300">
                            {record.reason}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 최근 푼 문제 */}
          <Card className="bg-white/5 backdrop-blur-md border-green-400/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Clock className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
                최근 해결한 문제
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[250px] md:max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-transparent scrollbar-track-transparent p-3 px-7" style={{ scrollbarColor: 'transparent transparent', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
                /* 사파리 전용 스크롤바 숨김 */
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
                  {dummyRecentProblems.map((problem) => (
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

          {/* 한달간 푼 문제 */}
          <Card className="bg-white/5 backdrop-blur-md border-purple-400/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
                이번 달 문제 해결
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[250px] md:max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-transparent scrollbar-track-transparent p-3 px-7" style={{ scrollbarColor: 'transparent transparent', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
                /* 사파리 전용 스크롤바 숨김 */
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
                  {dummyMonthlyProblems.map((problem) => (
                    <TableRow key={problem.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-white font-medium">{problem.user}</TableCell>
                      <TableCell>
                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                          {problem.problemCount}개
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default ActivitySection; 