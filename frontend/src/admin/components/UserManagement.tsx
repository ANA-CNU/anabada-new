import { useEffect, useMemo, useState } from "react";
import { SquircleSurface } from "@/components/ui/squircle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { URL } from "@/resource/constant";
import { Separator } from "@/components/ui/separator";
import type { User } from "@/types";

const messageOf = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return users;
    return users.filter(u => 
      u.jungol_name.toLowerCase().includes(f) ||
      (u.korean_name && u.korean_name.toLowerCase().includes(f))
    );
  }, [users, filter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${URL}/api/users/all`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.message || '조회 실패');
      setUsers(json.data || []);
    } catch (err: unknown) {
      setError(messageOf(err, '서버 오류'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const startEdit = (user: User) => {
    setEditingId(user.id);
    setEditForm({
      jungol_name: user.jungol_name,
      corrects: user.corrects,
      submissions: user.submissions,
      solution: user.solution,
      korean_name: user.korean_name,
      tier: user.tier,
      ac_rating: user.ac_rating,
      ignored: user.ignored,
      jungol_account_id: user.jungol_account_id,
      rank_wrong_count: user.rank_wrong_count
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (id: number) => {
    try {
      const payload: Record<string, string | number | boolean | null> = {};
      if (typeof editForm.jungol_name !== "undefined") payload.jungol_name = editForm.jungol_name;
      if (typeof editForm.corrects !== "undefined") payload.corrects = Number(editForm.corrects) || 0;
      if (typeof editForm.submissions !== "undefined") payload.submissions = Number(editForm.submissions) || 0;
      if (typeof editForm.solution !== "undefined") payload.solution = editForm.solution;
      if (typeof editForm.korean_name !== "undefined") payload.korean_name = editForm.korean_name;
      if (typeof editForm.tier !== "undefined") payload.tier = Number(editForm.tier) || 0;
      if (typeof editForm.ac_rating !== "undefined") payload.ac_rating = Number(editForm.ac_rating) || 0;
      if (typeof editForm.ignored !== "undefined") payload.ignored = editForm.ignored;
      if (typeof editForm.jungol_account_id !== "undefined") payload.jungol_account_id = editForm.jungol_account_id;
      if (typeof editForm.rank_wrong_count !== "undefined") payload.rank_wrong_count = Number(editForm.rank_wrong_count) || 0;

      const res = await fetch(`${URL}/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || json?.success === false) throw new Error(json?.message || '수정 실패');

      await fetchUsers();
      cancelEdit();
    } catch (err: unknown) {
      alert(messageOf(err, '수정 중 오류가 발생했습니다.'));
    }
  };

  const deleteUser = async (id: number) => {
    if (!confirm(`정말로 유저 #${id}를 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`${URL}/api/users/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const json = await res.json();
      if (!res.ok || json?.success === false) throw new Error(json?.message || '삭제 실패');
      await fetchUsers();
    } catch (err: unknown) {
      alert(messageOf(err, '삭제 중 오류가 발생했습니다.'));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">유저 목록</h2>
        <p className="text-muted-foreground">모든 유저의 정보를 조회, 수정, 삭제할 수 있습니다. 정올 수집 메타데이터는 다음 수집 주기에 덮어써질 수 있습니다.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>유저 검색</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)} 
              placeholder="정올명, 한국명 검색"
              className="max-w-xs" 
            />
            <Button variant="outline" onClick={fetchUsers}>새로고침</Button>
          </div>
        </CardContent>
      </Card>

      <SquircleSurface radius="surface" className="border">
        <div className="overflow-x-auto">
        <table className="min-w-full whitespace-nowrap text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2">ID</th>
              <th className="text-left px-4 py-2">정올명</th>
              <th className="text-left px-4 py-2">한국명</th>
              <th className="text-left px-4 py-2">Corrects</th>
              <th className="text-left px-4 py-2">Submissions</th>
              <th className="text-left px-4 py-2">Solution</th>
              <th className="text-left px-4 py-2">Tier</th>
              <th className="text-left px-4 py-2">AC Rating</th>
              <th className="text-left px-4 py-2">정올 계정 ID</th>
              <th className="text-left px-4 py-2">오답 수</th>
              <th className="text-left px-4 py-2">Ignored</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={11} className="px-4 py-6 text-center text-muted-foreground">불러오는 중...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-6 text-center text-muted-foreground">데이터가 없습니다.</td></tr>
            )}
            {!loading && filtered.map((user) => {
              const isEditing = editingId === user.id;
              return (
                <tr key={user.id} className="border-t">
                  <td className="px-4 py-2">{user.id}</td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <Input
                        value={editForm.jungol_name ?? ""}
                        onChange={(e) => setEditForm(prev => ({ ...prev, jungol_name: e.target.value }))}
                        className="w-32"
                      />
                    ) : (
                      user.jungol_name
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <Input
                        value={editForm.korean_name ?? ""}
                        onChange={(e) => setEditForm(prev => ({ ...prev, korean_name: e.target.value || null }))}
                        className="w-24"
                      />
                    ) : (
                      user.korean_name || "-"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={String(editForm.corrects ?? 0)}
                        onChange={(e) => setEditForm(prev => ({ ...prev, corrects: Number(e.target.value) }))}
                        className="w-20"
                      />
                    ) : (
                      user.corrects
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={String(editForm.submissions ?? 0)}
                        onChange={(e) => setEditForm(prev => ({ ...prev, submissions: Number(e.target.value) }))}
                        className="w-20"
                      />
                    ) : (
                      user.submissions
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <Input
                        inputMode="numeric"
                        value={editForm.solution ?? ""}
                        onChange={(e) => setEditForm(prev => ({ ...prev, solution: e.target.value }))}
                        className="w-20"
                      />
                    ) : (
                      user.solution
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={String(editForm.tier ?? 0)}
                        onChange={(e) => setEditForm(prev => ({ ...prev, tier: Number(e.target.value) }))}
                        className="w-16"
                      />
                    ) : (
                      user.tier
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={String(editForm.ac_rating ?? 0)}
                        onChange={(e) => setEditForm(prev => ({ ...prev, ac_rating: Number(e.target.value) }))}
                        className="w-24"
                      />
                    ) : (
                      user.ac_rating
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <Input
                        inputMode="numeric"
                        value={editForm.jungol_account_id ?? ""}
                        onChange={(e) => setEditForm(prev => ({ ...prev, jungol_account_id: e.target.value }))}
                        className="w-24"
                      />
                    ) : (
                      user.jungol_account_id
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <SquircleSurface asChild radius="control">
                      <select
                        value={String(editForm.ignored ?? false)}
                        onChange={(e) => setEditForm(prev => ({ ...prev, ignored: e.target.value === "true" }))}
                        className="border px-2 py-1 text-sm bg-background w-16"
                      >
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                      </SquircleSurface>
                    ) : (
                      user.ignored ? "Yes" : "No"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <Input type="number" value={String(editForm.rank_wrong_count ?? 0)} onChange={(e) => setEditForm(prev => ({ ...prev, rank_wrong_count: Number(e.target.value) }))} className="w-20" />
                    ) : user.rank_wrong_count}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(user.id)}>저장</Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>취소</Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEdit(user)}>수정</Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteUser(user.id)}>삭제</Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </SquircleSurface>

      <Separator />
    </div>
  );
}
