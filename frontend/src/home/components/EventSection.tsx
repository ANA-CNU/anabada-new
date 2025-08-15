import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar, Clock, Trophy, Code } from "lucide-react";
import { URL } from "@/resource/constant";

interface EventData {
  event_title: string;
  startDate: string;
  endDate: string;
  problems: string;
}

interface EventsResponse {
  success: boolean;
  data: EventData[];
  message: string;
  summary: {
    count: number;
    status: string;
    max_limit: number;
  };
}


function EventSection() {
  const [ongoingEvents, setOngoingEvents] = useState<EventData[]>([]);
  const [pastEvents, setPastEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const [ongoingResonse, pastResponse] = await Promise.all([
          fetch(`${URL}/api/events/ongoing`),
          fetch(`${URL}/api/events/past`)
        ]);

        const ongoingResult: EventsResponse = await ongoingResponse.json();
        const pastResult: EventsResponse = await pastResponse.json();

        if (ongoingResult.success) {
          setOngoingEvents(ongoingResult.data);
        }
        if (pastResult.success) {
          setPastEvents(pastResult.data);
        }
      } catch (error) {
        console.error('이벤트 데이터 가져오기 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

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

  const formatProblems = (problems: string) => {
    if (!problems || problems === "") return "문제 없음";
    
    const problemArray = problems.split(',').map(p => p.trim());
    
    if (problemArray.length > 20) {
      const first20 = problemArray.slice(0, 20);
      return `${first20.join(', ')} ... 외 ${problemArray.length - 20}개`;
    }
    
    return problems;
  };

  return (
    <TooltipProvider>
      <div className="w-full px-8 py-6 mb-10">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-white text-lg">데이터 로딩 중...</div>
            </div>
          ) : (
            <>
              {/* 현재 진행중인 이벤트들 */}
              {ongoingEvents.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <Trophy className="w-6 h-6 text-yellow-400" />
                현재 진행중인 이벤트 ({ongoingEvents.length}개)
              </h2>
              <div className="space-y-4">
                {ongoingEvents.map((event, index) => (
                  <Card key={index} className="bg-white/10 backdrop-blur-md border-yellow-400/30 shadow-[0_0_20px_rgba(255,215,0,0.2)]">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-xl">{event.event_title}</CardTitle>
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/30">
                          진행중
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-white/80">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-yellow-400" />
                          <span>시작: {formatDate(event.startDate)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-yellow-400" />
                          <span>종료: {formatDate(event.endDate)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-red-400" />
                          <span className="text-red-300">{getTimeRemaining(event.endDate)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Code className="w-4 h-4 text-blue-400" />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help hover:text-blue-300 transition-colors">
                                문제 {event.problems.split(',').length}개
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md">
                              <div className="text-sm">
                                <div className="font-semibold mb-2">이벤트 문제 목록:</div>
                                <div className="text-xs text-gray-300">
                                  {formatProblems(event.problems)}
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
              {pastEvents.map((event, index) => (
                <Card key={index} className="bg-white/5 backdrop-blur-md border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-105">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">{event.event_title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-white/70 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-400" />
                        <span>시작: {formatDate(event.startDate)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-green-400" />
                        <span>종료: {formatDate(event.endDate)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Code className="w-4 h-4 text-purple-400" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help hover:text-purple-300 transition-colors">
                              문제 {event.problems.split(',').length}개
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            <div className="text-sm">
                              <div className="font-semibold mb-2">이벤트 문제 목록:</div>
                              <div className="text-xs text-gray-300">
                                {formatProblems(event.problems)}
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
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

export default EventSection; 