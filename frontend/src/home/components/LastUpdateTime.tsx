import { useEffect, useState } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { URL } from "@/resource/constant";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type UpdateTime =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly exact: string; readonly relative: string }
  | { readonly kind: "empty" }
  | { readonly kind: "error" };

const minuteInMilliseconds = 60 * 1000;
const hourInMilliseconds = 60 * minuteInMilliseconds;
const dayInMilliseconds = 24 * hourInMilliseconds;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatRelativeTime(date: Date): string {
  const difference = Date.now() - date.getTime();

  if (difference < minuteInMilliseconds) return "방금 전";
  if (difference < hourInMilliseconds) return `${Math.floor(difference / minuteInMilliseconds)}분 전`;
  if (difference < dayInMilliseconds) return `${Math.floor(difference / hourInMilliseconds)}시간 전`;
  return `${Math.floor(difference / dayInMilliseconds)}일 전`;
}

function parseUpdateTime(result: unknown): UpdateTime {
  if (!isRecord(result) || result.success !== true) return { kind: "error" };
  if (result.data === null || result.data === undefined) return { kind: "empty" };
  if (!isRecord(result.data) || typeof result.data.created_at !== "string") return { kind: "error" };

  const date = new Date(result.data.created_at);
  if (!Number.isFinite(date.getTime())) return { kind: "error" };

  const exact = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Seoul",
  }).format(date);

  return { kind: "ready", exact: `${exact} KST`, relative: formatRelativeTime(date) };
}

// 마지막 업데이트 시간 표시 컴포넌트
export default function LastUpdateTime() {
  const [updateTime, setUpdateTime] = useState<UpdateTime>({ kind: "loading" });

  useEffect(() => {
    const fetchLastUpdate = async () => {
      try {
        const response = await fetch(`${URL}/api/board/recently-date`);
        if (!response.ok) {
          setUpdateTime({ kind: "error" });
          return;
        }

        setUpdateTime(parseUpdateTime(await response.json()));
      } catch {
        setUpdateTime({ kind: "error" });
      }
    };

    void fetchLastUpdate();
    // 5분마다 업데이트
    const interval = setInterval(fetchLastUpdate, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  if (updateTime.kind === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-white/60 text-xs animate-pulse">
        <RefreshCw className="w-3 h-3" />
        <span>업데이트 확인 중...</span>
      </div>
    );
  }

  const lastUpdate = updateTime.kind === "ready"
    ? updateTime.relative
    : updateTime.kind === "empty"
      ? "업데이트 기록 없음"
      : "시간 조회 실패";
  const exactTime = updateTime.kind === "ready" ? updateTime.exact : lastUpdate;

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
