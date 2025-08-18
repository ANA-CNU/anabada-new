import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { URL } from "@/resource/constant";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button as ShadButton } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";

type BiasRow = {
  user_id: number;
  username: string;
  total_point: number;
  updated_at: string | null;
};

export default function BiasManagement() {
  const [rows, setRows] = useState<BiasRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [begin, setBegin] = useState(""); // YYYY-MM-DD HH:MM:SS
  const [end, setEnd] = useState("");   // YYYY-MM-DD HH:MM:SS
  const [beginDate, setBeginDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [beginTime, setBeginTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState("23:59:59");
  const [isRecalcLoading, setIsRecalcLoading] = useState(false);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter(r => r.username.toLowerCase().includes(f));
  }, [rows, filter]);

  const fetchRows = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${URL}/api/bias/all`, { credentials: 'include' });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.message || '조회 실패');
      setRows(json.data || []);
    } catch (err: any) {
      setError(err?.message || '서버 오류');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const onRecalculate = async () => {
    if (!begin || !end) {
      alert('begin과 end를 YYYY-MM-DD HH:MM:SS 형식으로 입력해주세요.');
      return;
    }
    try {
      setIsRecalcLoading(true);
      const res = await fetch(`${URL}/api/bias/date-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ begin, end })
      });
      const json = await res.json();
      if (!res.ok || json?.success === false) throw new Error(json?.message || '재계산 실패');
      await fetchRows();
      alert(`재계산 완료: ${json.insertedCount}건`);
    } catch (err: any) {
      alert(err?.message || '재계산 중 오류가 발생했습니다.');
    } finally {
      setIsRecalcLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">가중치 관리</h2>
        <p className="text-muted-foreground">모든 유저의 누적 가중치를 확인하고, 기간 기반으로 재계산합니다.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>기간 기반 재계산</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm text-muted-foreground">Begin</label>
                <div className="flex gap-2 items-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <ShadButton variant="outline" className="justify-start w-52">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {beginDate ? beginDate.toLocaleDateString() : "날짜 선택"}
                      </ShadButton>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={beginDate}
                        onSelect={(d) => {
                          setBeginDate(d);
                          if (d) {
                            const yyyy = d.getFullYear();
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const dd = String(d.getDate()).padStart(2, '0');
                            setBegin(`${yyyy}-${mm}-${dd} ${beginTime}`);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <Input className="w-36" placeholder="HH:MM:SS" value={beginTime} onChange={(e) => {
                    const v = e.target.value; setBeginTime(v);
                    if (beginDate) {
                      const yyyy = beginDate.getFullYear();
                      const mm = String(beginDate.getMonth() + 1).padStart(2, '0');
                      const dd = String(beginDate.getDate()).padStart(2, '0');
                      setBegin(`${yyyy}-${mm}-${dd} ${v}`);
                    }
                  }} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm text-muted-foreground">End</label>
                <div className="flex gap-2 items-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <ShadButton variant="outline" className="justify-start w-52">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? endDate.toLocaleDateString() : "날짜 선택"}
                      </ShadButton>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={(d) => {
                          setEndDate(d);
                          if (d) {
                            const yyyy = d.getFullYear();
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const dd = String(d.getDate()).padStart(2, '0');
                            setEnd(`${yyyy}-${mm}-${dd} ${endTime}`);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <Input className="w-36" placeholder="HH:MM:SS" value={endTime} onChange={(e) => {
                    const v = e.target.value; setEndTime(v);
                    if (endDate) {
                      const yyyy = endDate.getFullYear();
                      const mm = String(endDate.getMonth() + 1).padStart(2, '0');
                      const dd = String(endDate.getDate()).padStart(2, '0');
                      setEnd(`${yyyy}-${mm}-${dd} ${v}`);
                    }
                  }} />
                </div>
              </div>
            </div>
            <div>
              <Button onClick={onRecalculate} disabled={isRecalcLoading}>재계산</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>유저 가중치 목록</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3">
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="사용자 검색" className="max-w-xs" />
            <Button variant="outline" onClick={fetchRows}>새로고침</Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-2">User</th>
                  <th className="text-left px-4 py-2">Total Bias</th>
                  <th className="text-left px-4 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">불러오는 중...</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">데이터가 없습니다.</td></tr>
                )}
                {!loading && filtered.map((r) => (
                  <tr key={r.user_id} className="border-t">
                    <td className="px-4 py-2">{r.username}</td>
                    <td className="px-4 py-2 font-medium">{r.total_point}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.updated_at ? new Date(r.updated_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

