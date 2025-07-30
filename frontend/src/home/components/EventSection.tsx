import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar, Clock, Trophy, Code } from "lucide-react";

interface Event {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  isActive?: boolean;
  problems?: number[];
}

// Dummy 데이터
const dummyEvents: Event[] = [
  {
    id: "1",
    title: "2024 겨울 알고리즘 챌린지",
    startTime: "2024-01-15T00:00:00Z",
    endTime: "2024-02-15T23:59:59Z",
    isActive: true,
    problems: [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015],
  },
  {
    id: "2",
    title: "2023 가을 코딩 대회",
    startTime: "2023-10-01T00:00:00Z",
    endTime: "2023-10-31T23:59:59Z",
    isActive: true,
    problems: [2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010],
  },
  {
    id: "3",
    title: "2023 여름 해커톤",
    startTime: "2023-07-01T00:00:00Z",
    endTime: "2023-07-15T23:59:59Z",
    problems: [3001, 3002, 3003, 3004, 3005],
  },
  {
    id: "5",
    title: "2023 겨울 코딩 챌린지",
    startTime: "2022-12-01T00:00:00Z",
    endTime: "2022-12-31T23:59:59Z",
    problems: [5001, 5002, 5003, 5004, 5005],
  },
  {
    id: "6",
    title: "2022 가을 알고리즘 대회",
    startTime: "2022-09-01T00:00:00Z",
    endTime: "2022-09-30T23:59:59Z",
    problems: [6001, 6002, 6003, 6004, 6005, 6006, 6007],
  },
  {
    id: "4",
    title: "2023 봄 알고리즘 대회",
    startTime: "2023-03-01T00:00:00Z",
    endTime: "2023-03-31T23:59:59Z",
    problems: [4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 4009, 4010, 4011, 4012],
  },
];

function EventSection() {
  const currentEvents = dummyEvents.filter(event => event.isActive);
  const pastEvents = dummyEvents.filter(event => !event.isActive).slice(0, 3);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getTimeRemaining = (endTime: string) => {
    const now = new Date();
    const end = new Date(endTime);
    const diff = end.getTime() - now.getTime();
    
    if (diff <= 0) return "종료됨";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return `${days}일 ${hours}시간 남음`;
  };

  const formatProblems = (problems: number[]) => {
    if (!problems || problems.length === 0) return "문제 없음";
    
    // 문제 번호를 정렬
    const sortedProblems = [...problems].sort((a, b) => a - b);
    
    // 20개 이상이면 앞의 20개만 표시하고 "..." 추가
    if (sortedProblems.length > 20) {
      const first20 = sortedProblems.slice(0, 20);
      return `${first20.join(', ')} ... 외 ${sortedProblems.length - 20}개`;
    }
    
    return sortedProblems.join(', ');
  };

  return (
    <TooltipProvider>
      <div className="w-full px-8 py-6 mb-10">
        <div className="max-w-6xl mx-auto">
          {/* 현재 진행중인 이벤트들 */}
          {currentEvents.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <Trophy className="w-6 h-6 text-yellow-400" />
                현재 진행중인 이벤트 ({currentEvents.length}개)
              </h2>
              <div className="space-y-4">
                {currentEvents.map((event) => (
                  <Card key={event.id} className="bg-white/10 backdrop-blur-md border-yellow-400/30 shadow-[0_0_20px_rgba(255,215,0,0.2)]">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-xl">{event.title}</CardTitle>
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/30">
                          진행중
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-white/80">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-yellow-400" />
                          <span>시작: {formatDate(event.startTime)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-yellow-400" />
                          <span>종료: {formatDate(event.endTime)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-red-400" />
                          <span className="text-red-300">{getTimeRemaining(event.endTime)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Code className="w-4 h-4 text-blue-400" />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help hover:text-blue-300 transition-colors">
                                문제 {event.problems?.length || 0}개
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md">
                              <div className="text-sm">
                                <div className="font-semibold mb-2">이벤트 문제 목록:</div>
                                <div className="text-xs text-gray-300">
                                  {formatProblems(event.problems || [])}
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* 이전 이벤트들 */}
          <div>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Trophy className="w-6 h-6 text-gray-400" />
              이전 이벤트
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pastEvents.map((event) => (
                <Card key={event.id} className="bg-white/5 backdrop-blur-md border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-105">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">{event.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-white/70 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-400" />
                        <span>시작: {formatDate(event.startTime)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-green-400" />
                        <span>종료: {formatDate(event.endTime)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Code className="w-4 h-4 text-purple-400" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help hover:text-purple-300 transition-colors">
                              문제 {event.problems?.length || 0}개
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            <div className="text-sm">
                              <div className="font-semibold mb-2">이벤트 문제 목록:</div>
                              <div className="text-xs text-gray-300">
                                {formatProblems(event.problems || [])}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default EventSection; 