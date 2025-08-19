import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { URL } from "@/resource/constant";
import { Separator } from "@/components/ui/separator";

type User = {
  id: number;
  name: string;
  corrects: number;
  submissions: number;
  solution: number;
  kr_name: string | null;
  atcoder_handle: string | null;
  codeforces_handle: string | null;
  tier: number;
  ignored: number;
};

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return users;
    return users.filter(u => 
      u.name.toLowerCase().includes(f) || 
      (u.kr_name && u.kr_name.toLowerCase().includes(f)) ||
      (u.atcoder_handle && u.atcoder_handle.toLowerCase().includes(f)) ||
      (u.codeforces_handle && u.codeforces_handle.toLowerCase().includes(f))
    );
  }, [users, filter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${URL}/api/users/all`, { credentials: 'include' });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.message || '조회 실패');
      setUsers(json.data || []);
    } catch (err: any) {
      setError(err?.message || '서버 오류');
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
      name: user.name,
      corrects: user.corrects,
      submissions: user.submissions,
      solution: user.solution,
      kr_name: user.kr_name,
      atcoder_handle: user.atcoder_handle,
      codeforces_handle: user.codeforces_handle,
      tier: user.tier,
      ignored: user.ignored
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (id: number) => {
    try {
      const payload: any = {};
      if (typeof editForm.name !== "undefined") payload.name = editForm.name;
      if (typeof editForm.corrects !== "undefined") payload.corrects = Number(editForm.corrects) || 0;
      if (typeof editForm.submissions !== "undefined") payload.submissions = Number(editForm.submissions) || 0;
      if (typeof editForm.solution !== "undefined") payload.solution = Number(editForm.solution) || 0;
      if (typeof editForm.kr_name !== "undefined") payload.kr_name = editForm.kr_name;
      if (typeof editForm.atcoder_handle !== "undefined") payload.atcoder_handle = editForm.atcoder_handle;
      if (typeof editForm.codeforces_handle !== "undefined") payload.codeforces_handle = editForm.codeforces_handle;
      if (typeof editForm.tier !== "undefined") payload.tier = Number(editForm.tier) || 0;
      if (typeof editForm.ignored !== "undefined") payload.ignored = Boolean(editForm.ignored) ? 1 : 0;

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
    } catch (err: any) {
      alert(err?.message || '수정 중 오류가 발생했습니다.');
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
    } catch (err: any) {
      alert(err?.message || '삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">유저 목록</h2>
        <p className="text-muted-foreground">모든 유저의 정보를 조회, 수정, 삭제할 수 있습니다.</p>
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
              placeholder="이름, 한국명, 핸들 검색" 
              className="max-w-xs" 
            />
            <Button variant="outline" onClick={fetchUsers}>새로고침</Button>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2">ID</th>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">한국명</th>
              <th className="text-left px-4 py-2">Corrects</th>
              <th className="text-left px-4 py-2">Submissions</th>
              <th className="text-left px-4 py-2">Solution</th>
              <th className="text-left px-4 py-2">Tier</th>
              <th className="text-left px-4 py-2">AtCoder</th>
              <th className="text-left px-4 py-2">CodeForces</th>
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
                        value={editForm.name ?? ""}
                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-32"
                      />
                    ) : (
                      user.name
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <Input
                        value={editForm.kr_name ?? ""}
                        onChange={(e) => setEditForm(prev => ({ ...prev, kr_name: e.target.value }))}
                        className="w-24"
                      />
                    ) : (
                      user.kr_name || "-"
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
                        type="number"
                        value={String(editForm.solution ?? 0)}
                        onChange={(e) => setEditForm(prev => ({ ...prev, solution: Number(e.target.value) }))}
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
                        value={editForm.atcoder_handle ?? ""}
                        onChange={(e) => setEditForm(prev => ({ ...prev, atcoder_handle: e.target.value }))}
                        className="w-24"
                      />
                    ) : (
                      user.atcoder_handle || "-"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <Input
                        value={editForm.codeforces_handle ?? ""}
                        onChange={(e) => setEditForm(prev => ({ ...prev, codeforces_handle: e.target.value }))}
                        className="w-24"
                      />
                    ) : (
                      user.codeforces_handle || "-"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <select
                        value={String(editForm.ignored ?? 0)}
                        onChange={(e) => setEditForm(prev => ({ ...prev, ignored: Number(e.target.value) }))}
                        className="border rounded px-2 py-1 text-sm bg-background w-16"
                      >
                        <option value={0}>No</option>
                        <option value={1}>Yes</option>
                      </select>
                    ) : (
                      user.ignored ? "Yes" : "No"
                    )}
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

      <Separator />
    </div>
  );
} 