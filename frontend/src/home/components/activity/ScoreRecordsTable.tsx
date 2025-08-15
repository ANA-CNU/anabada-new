import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import type { ScoreRecord } from './types';
import { formatRelativeTime, formatExactTime, getScoreColor } from './types';
import { URL } from "@/resource/constant";

interface ScoreRecordsTableProps {
  records: ScoreRecord[];
}

function ScoreRecordsTable({ records }: ScoreRecordsTableProps) {
  const [items, setItems] = useState<ScoreRecord[]>([]);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  interface ApiResponse {
    success: boolean;
    data: Array<{
      username: string;
      desc: string;
      bias: number;
      createdAt: string;
    }>;
    message: string;
    summary?: {
      count?: number;
      limit?: number;
      page?: number;
    };
  }

  useEffect(() => {
    let cancelled = false;
    const fetchPage = async () => {
      if (loading) return;
      setLoading(true);
      try {
        const res = await fetch(`${URL}/api/statistics/recently-score?page=${page}&limit=${limit}`);
        const json: ApiResponse = await res.json();
        if (!cancelled && json.success) {
          const mapped: ScoreRecord[] = json.data.map((d, idx) => ({
            id: `${page}-${idx}-${d.username}-${d.createdAt}`,
            user: d.username,
            reason: d.desc,
            score: d.bias,
            time: d.createdAt
          }));
          setItems(prev => page === 1 ? mapped : [...prev, ...mapped]);
          // 더 가져올 수 있는지 판단: 반환 개수가 limit 미만이면 더 없음
          setHasMore(mapped.length === limit);
        }
      } catch (e) {
        console.error('최근 점수 기록 가져오기 실패:', e);
        if (!cancelled && page === 1 && records?.length) {
          setItems(records);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPage();
    return () => { cancelled = true; };
  }, [page]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || loading || !hasMore) return;
    const threshold = 32; // px
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
      setPage(p => p + 1);
    }
  };

  return (
    <Card className="bg-white/5 backdrop-blur-md border-blue-400/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Trophy className="w-4 h-4 md:w-5 md:h-5 text-yellow-400" />
          최근 점수 획득
        </CardTitle>
      </CardHeader>
      <CardContent ref={scrollRef} onScroll={handleScroll} className="max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-transparent scrollbar-track-transparent p-3 px-7" style={{ scrollbarColor: 'transparent transparent', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
              <TableHead className="text-white/70">점수</TableHead>
              <TableHead className="text-white/70">시간</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((record) => (
              <Tooltip key={record.id}>
                <TooltipTrigger asChild>
                  <TableRow className="border-white/10 hover:bg-white/5 cursor-help">
                    <TableCell className="text-white font-medium">{record.user}</TableCell>
                    <TableCell>
                      <Badge className={getScoreColor(record.score, record.user)}>
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
            {loading && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-white/70 py-3">
                  더 불러오는 중...
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default ScoreRecordsTable; 