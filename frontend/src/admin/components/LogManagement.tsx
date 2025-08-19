import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { URL } from "@/resource/constant";
import { Separator } from "@/components/ui/separator";

type ScoreHistoryRow = {
  id: number;
  username: string;
  desc: string | null;
  bias: number;
  event_id: number | null;
  problem_id: number | null;
  created_at: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

export default function LogManagement() {
  const [rows, setRows] = useState<ScoreHistoryRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchUsername, setSearchUsername] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Pick<ScoreHistoryRow, "desc" | "bias" | "event_id" | "problem_id">>>({});

  const canPrev = useMemo(() => pagination.page > 1, [pagination.page]);
  const canNext = useMemo(() => pagination.page < pagination.total_pages, [pagination.page, pagination.total_pages]);

  const fetchRows = async (opts?: { page?: number; limit?: number; username?: string }) => {
    const page = opts?.page ?? pagination.page;
    const limit = opts?.limit ?? pagination.limit;
    const username = (opts?.username ?? searchUsername).trim();
    const qp = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (username) qp.set("username", username);

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${URL}/api/admin/score-history?${qp.toString()}`, { credentials: "include" });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.message || "조회 실패");
      setRows(json.data || []);
      setPagination(json.pagination);
    } catch (err: any) {
      setError(err?.message || "서버 오류");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEdit = (row: ScoreHistoryRow) => {
    setEditingId(row.id);
    setEditForm({ desc: row.desc ?? "", bias: row.bias, event_id: row.event_id, problem_id: row.problem_id });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (id: number) => {
    try {
      const payload: any = {};
      if (typeof editForm.desc !== "undefined") payload.desc = editForm.desc;
      if (typeof editForm.bias !== "undefined") payload.bias = Number(editForm.bias) || 0;
      if (typeof editForm.event_id !== "undefined") payload.eventId = editForm.event_id ?? null;
      if (typeof editForm.problem_id !== "undefined") payload.problemId = editForm.problem_id ?? null;

      const res = await fetch(`${URL}/api/score-history/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || json?.success === false) throw new Error(json?.message || "수정 실패");

      // 목록 갱신 (현재 페이지 유지)
      await fetchRows();
      cancelEdit();
    } catch (err: any) {
      alert(err?.message || "수정 중 오류가 발생했습니다.");
    }
  };

  const deleteRow = async (id: number) => {
    if (!confirm(`정말로 #${id} 로그를 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`${URL}/api/score-history/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      const json = await res.json();
      if (!res.ok || json?.success === false) throw new Error(json?.message || "삭제 실패");
      // 현재 페이지에서 항목 제거 후 필요시 재조회
      if (rows.length === 1 && pagination.page > 1) {
        // 마지막 항목 삭제 시 이전 페이지로 이동
        await fetchRows({ page: pagination.page - 1 });
      } else {
        await fetchRows();
      }
    } catch (err: any) {
      alert(err?.message || "삭제 중 오류가 발생했습니다.");
    }
  };

  const onChangePageSize = async (limit: number) => {
    await fetchRows({ page: 1, limit });
  };

  const onSearch = async () => {
    await fetchRows({ page: 1 });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">로그 관리</h2>
        <p className="text-muted-foreground">score_history 조회/수정/삭제를 관리합니다.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>검색 및 필터</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">사용자</span>
              <Input
                value={searchUsername}
                onChange={(e) => setSearchUsername(e.target.value)}
                placeholder="username"
                className="w-48"
              />
              <Button onClick={onSearch} disabled={loading}>검색</Button>
            </div>
            <div className="flex items-center gap-2 md:ml-auto">
              <span className="text-sm text-muted-foreground">페이지당</span>
              <select
                className="border rounded px-2 py-1 text-sm bg-background"
                value={pagination.limit}
                onChange={(e) => onChangePageSize(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border">
        <div className="overflow-x-auto w-full">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2">ID</th>
                <th className="text-left px-4 py-2">User</th>
                <th className="text-left px-4 py-2">Desc</th>
                <th className="text-left px-4 py-2">Bias</th>
                <th className="text-left px-4 py-2">Event</th>
                <th className="text-left px-4 py-2">Problem</th>
                <th className="text-left px-4 py-2">Created</th>
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">불러오는 중...</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">데이터가 없습니다.</td>
                </tr>
              )}
              {!loading && rows.map((row) => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-2 align-top">{row.id}</td>
                    <td className="px-4 py-2 align-top">{row.username}</td>
                    <td className="px-4 py-2 align-top w-[26rem]">
                      {isEditing ? (
                        <Input
                          value={editForm.desc ?? ""}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, desc: e.target.value }))}
                          placeholder="설명"
                        />
                      ) : (
                        <span className="whitespace-pre-wrap break-words">{row.desc}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top w-28">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={String(editForm.bias ?? 0)}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, bias: Number(e.target.value) }))}
                        />
                      ) : (
                        row.bias
                      )}
                    </td>
                    <td className="px-4 py-2 align-top w-28">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={String(editForm.event_id ?? "")}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, event_id: e.target.value === "" ? null : Number(e.target.value) }))}
                        />
                      ) : (
                        row.event_id ?? ""
                      )}
                    </td>
                    <td className="px-4 py-2 align-top w-28">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={String(editForm.problem_id ?? "")}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, problem_id: e.target.value === "" ? null : Number(e.target.value) }))}
                        />
                      ) : (
                        row.problem_id ?? ""
                      )}
                    </td>
                    <td className="px-4 py-2 align-top text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2 align-top">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(row.id)}>저장</Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>취소</Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => startEdit(row)}>수정</Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteRow(row.id)}>삭제</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          총 {pagination.total}건 · {pagination.page}/{pagination.total_pages}페이지
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={!canPrev} onClick={() => fetchRows({ page: pagination.page - 1 })}>이전</Button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">페이지</span>
            <Input
              className="w-16 h-8"
              type="number"
              value={String(pagination.page)}
              onChange={(e) => fetchRows({ page: Math.max(1, Math.min(Number(e.target.value) || 1, pagination.total_pages || 1)) })}
            />
          </div>
          <Button variant="outline" disabled={!canNext} onClick={() => fetchRows({ page: pagination.page + 1 })}>다음</Button>
        </div>
      </div>

      <Separator />
    </div>
  );
}

