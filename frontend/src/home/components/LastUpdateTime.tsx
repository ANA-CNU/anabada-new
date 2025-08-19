import { useEffect, useState } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { URL } from "@/resource/constant";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// 마지막 업데이트 시간 표시 컴포넌트
export default function LastUpdateTime() {
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [exactTime, setExactTime] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLastUpdate = async () => {
      try {
        const response = await fetch(`${URL}/api/board/recently-date`);
        const result = await response.json();
        
        if (result.success && result.data && result.data.length > 0) {
          const updateTime = result.data[0].updatedAt;
          // ISO8601 문자열을 Date 객체로 변환
          const date = new Date(updateTime);
          
          // 정확한 시간 포맷팅 (한국 시간)
          const koreanTime = new Intl.DateTimeFormat('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Asia/Seoul'
          }).format(date);
          
          setExactTime(koreanTime);
          
          // 상대적 시간으로 표시 (예: "2시간 전", "1일 전")
          const now = new Date();
          const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
          
          let timeText = "";
          if (diffInHours < 1) {
            const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
            if (diffInMinutes < 1) {
              timeText = "방금 전";
            } else {
              timeText = `${diffInMinutes}분 전`;
            }
          } else if (diffInHours < 24) {
            timeText = `${diffInHours}시간 전`;
          } else {
            const diffInDays = Math.floor(diffInHours / 24);
            timeText = `${diffInDays}일 전`;
          }
          
          setLastUpdate(timeText);
        }
      } catch (error) {
        console.error("마지막 업데이트 시간 조회 실패:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLastUpdate();
    // 5분마다 업데이트
    const interval = setInterval(fetchLastUpdate, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-white/60 text-xs animate-pulse">
        <RefreshCw className="w-3 h-3" />
        <span>업데이트 확인 중...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center gap-2 text-white/60 text-xs mb-2 cursor-help hover:text-white/80 transition-colors">
            <Clock className="w-3 h-3" />
            <span>마지막 업데이트: {lastUpdate}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          className="max-w-xs p-3 bg-gray-900 text-white border-gray-700"
        >
          <div className="space-y-2">
            <div className="font-semibold text-sm">랭킹 보드 업데이트 정보</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-300 mr-1">정확한 시간 :</span>
                <span className="text-white font-medium">{exactTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">상대적 시간:</span>
                <span className="text-white font-medium">{lastUpdate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">업데이트 주기:</span>
                <span className="text-white font-medium">5분마다 자동 갱신</span>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
} 