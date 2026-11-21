import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { URL } from "@/resource/constant";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { parseUpdateTime, type UpdateTime } from "../update-time";

export default function LastUpdateTime({ initialUpdateTime }: { readonly initialUpdateTime: UpdateTime }) {
  const [updateTime, setUpdateTime] = useState(initialUpdateTime);

  useEffect(() => {
    const controller = new AbortController();
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${URL}/api/board/recently-date`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload: unknown = response.ok ? await response.json() : null;
        setUpdateTime(parseUpdateTime(payload, Date.now()));
      } catch {
        if (!controller.signal.aborted) setUpdateTime({ kind: "error" });
      }
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, []);

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
          <button type="button" className="flex w-full items-center justify-center gap-2 text-white/60 text-xs mb-2 cursor-help hover:text-white/80 transition-colors">
            <Clock aria-hidden="true" className="w-3 h-3" />
            <span>마지막 업데이트: {lastUpdate}</span>
          </button>
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
                {updateTime.kind === "ready"
                  ? <time className="text-white font-medium" dateTime={updateTime.dateTime}>{exactTime}</time>
                  : <span className="text-white font-medium">{exactTime}</span>}
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">상대적 시간:</span>
                <span className="text-white font-medium">{lastUpdate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">업데이트 주기:</span>
                <span className="text-white font-medium">매시 10분 마다</span>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
