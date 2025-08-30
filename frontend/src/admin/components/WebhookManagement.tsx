import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, Power, PowerOff, ExternalLink } from "lucide-react";
import { URL } from "@/resource/constant";

interface Webhook {
  id: number;
  url: string;
  ignored: number;
  created_at: string;
}

interface WebhookFormData {
  url: string;
  ignored: number;
}

export default function WebhookManagement() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [formData, setFormData] = useState<WebhookFormData>({
    url: "",
    ignored: 0
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    total_pages: 0
  });

  // Webhook 목록 조회
  const fetchWebhooks = async (page: number = 1) => {
    try {
      setLoading(true);
      const response = await fetch(`${URL}/api/hooks?page=${page}&limit=10`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Webhook 목록 조회에 실패했습니다.');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setWebhooks(data.data);
        setPagination(data.pagination);
      } else {
        setError(data.message || 'Webhook 목록 조회에 실패했습니다.');
      }
    } catch (err: any) {
      setError(err.message || 'Webhook 목록 조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Webhook 생성
  const createWebhook = async () => {
    try {
      if (!formData.url.trim()) {
        setError('URL을 입력해주세요.');
        return;
      }

      setError(null); // 이전 에러 초기화
      
      const response = await fetch(`${URL}/api/hooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setIsCreateDialogOpen(false);
        setFormData({ url: "", ignored: 0 });
        fetchWebhooks();
      } else {
        setError(data.message || 'Webhook 생성에 실패했습니다.');
      }
    } catch (err: any) {
      setError(err.message || 'Webhook 생성 중 오류가 발생했습니다.');
    }
  };

  // Webhook 수정
  const updateWebhook = async () => {
    if (!editingWebhook) return;

    try {
      setError(null); // 이전 에러 초기화
      
      const response = await fetch(`${URL}/api/hooks/${editingWebhook.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setIsEditDialogOpen(false);
        setEditingWebhook(null);
        setFormData({ url: "", ignored: 0 });
        fetchWebhooks();
      } else {
        setError(data.message || 'Webhook 수정에 실패했습니다.');
      }
    } catch (err: any) {
      setError(err.message || 'Webhook 수정 중 오류가 발생했습니다.');
    }
  };

  // Webhook 삭제
  const deleteWebhook = async (id: number) => {
    if (!confirm('정말로 이 Webhook을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`${URL}/api/hooks/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        fetchWebhooks();
      } else {
        setError(data.message || 'Webhook 삭제에 실패했습니다.');
      }
    } catch (err: any) {
      setError(err.message || 'Webhook 삭제 중 오류가 발생했습니다.');
    }
  };

  // Webhook 상태 토글
  const toggleWebhookStatus = async (id: number) => {
    try {
      const response = await fetch(`${URL}/api/hooks/${id}/toggle`, {
        method: 'PATCH',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        fetchWebhooks();
      } else {
        setError(data.message || 'Webhook 상태 변경에 실패했습니다.');
      }
    } catch (err: any) {
      setError(err.message || 'Webhook 상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 편집 모드 시작
  const startEdit = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setFormData({
      url: webhook.url,
      ignored: webhook.ignored
    });
    setIsEditDialogOpen(true);
  };

  // URL 검증
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Webhook 관리</h2>
          <p className="text-muted-foreground">
            Discord webhook을 관리합니다.
          </p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Webhook 관리</h2>
          <p className="text-muted-foreground">
            Discord webhook을 관리합니다.
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Webhook 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 Webhook 추가</DialogTitle>
              <DialogDescription>
                Discord webhook URL을 입력하여 새로운 webhook을 추가합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="url">Webhook URL</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="ignored"
                  checked={formData.ignored === 1}
                  onChange={(e) => setFormData({ ...formData, ignored: e.target.checked ? 1 : 0 })}
                />
                <Label htmlFor="ignored">비활성화</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={createWebhook}>
                추가
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
          <Button
            variant="ghost"
            size="sm"
            className="ml-2"
            onClick={() => setError(null)}
          >
            ✕
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Webhook 목록</CardTitle>
          <CardDescription>
            총 {pagination.total}개의 webhook이 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>생성일</TableHead>
                <TableHead>작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell>{webhook.id}</TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <span className="truncate max-w-xs">{webhook.url}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(webhook.url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={webhook.ignored === 1 ? "secondary" : "default"}>
                      {webhook.ignored === 1 ? "비활성화" : "활성화"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(webhook.created_at).toLocaleString('ko-KR')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleWebhookStatus(webhook.id)}
                      >
                        {webhook.ignored === 1 ? (
                          <Power className="h-4 w-4" />
                        ) : (
                          <PowerOff className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(webhook)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteWebhook(webhook.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 편집 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook 수정</DialogTitle>
            <DialogDescription>
              Webhook 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-url">Webhook URL</Label>
              <Input
                id="edit-url"
                type="url"
                placeholder="https://discord.com/api/webhooks/..."
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit-ignored"
                checked={formData.ignored === 1}
                onChange={(e) => setFormData({ ...formData, ignored: e.target.checked ? 1 : 0 })}
              />
              <Label htmlFor="edit-ignored">비활성화</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={updateWebhook}>
              수정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 페이지네이션 */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-center space-x-2">
          <Button
            variant="outline"
            onClick={() => fetchWebhooks(pagination.page - 1)}
            disabled={pagination.page <= 1}
          >
            이전
          </Button>
          <span className="text-sm">
            {pagination.page} / {pagination.total_pages}
          </span>
          <Button
            variant="outline"
            onClick={() => fetchWebhooks(pagination.page + 1)}
            disabled={pagination.page >= pagination.total_pages}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}
