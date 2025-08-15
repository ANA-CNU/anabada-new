import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { 
  Calendar, 
  Clock, 
  Edit, 
  Trash2, 
  Plus, 
  Eye,
  AlertTriangle,
  CheckCircle,
  XCircle
} from "lucide-react";
// toast 대신 alert 사용

interface Event {
  id: number;
  title: string;
  desc?: string;
  begin: string;
  end: string;
  created_at: string;
  problem_count: number;
}

interface EventDetail extends Event {
  problems: number[];
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

const EventList: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    total_pages: 0
  });
  const [selectedEvent, setSelectedEvent] = useState<EventDetail | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    desc: '',
    begin: '',
    end: '',
    problems: ''
  });

  const URL = import.meta.env.MODE === 'production' ? '' : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000');

  // 이벤트 목록 조회
  const fetchEvents = async (page: number = 1) => {
    try {
      setLoading(true);
      const response = await fetch(`${URL}/api/events?page=${page}&limit=10`);
      const result = await response.json();

      if (result.success) {
        setEvents(result.data);
        setPagination(result.pagination);
      } else {
        alert(result.message || '이벤트 목록 조회에 실패했습니다.');
      }
    } catch (error) {
      console.error('이벤트 목록 조회 실패:', error);
      alert('이벤트 목록 조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 이벤트 상세 조회
  const fetchEventDetail = async (eventId: number) => {
    try {
      const response = await fetch(`${URL}/api/events/${eventId}`);
      const result = await response.json();

      if (result.success) {
        setSelectedEvent(result.data);
      } else {
        alert(result.message || '이벤트 상세 조회에 실패했습니다.');
      }
    } catch (error) {
      console.error('이벤트 상세 조회 실패:', error);
      alert('이벤트 상세 조회 중 오류가 발생했습니다.');
    }
  };

  // 이벤트 수정
  const handleEditEvent = async () => {
    if (!selectedEvent) return;

    try {
      const response = await fetch(`${URL}/api/events/${selectedEvent.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm)
      });
      const result = await response.json();

      if (result.success) {
        alert('이벤트가 성공적으로 수정되었습니다.');
        setEditDialogOpen(false);
        setSelectedEvent(null);
        setEditForm({ title: '', desc: '', begin: '', end: '', problems: '' });
        fetchEvents(pagination.page); // 현재 페이지 새로고침
      } else {
        alert(result.message || '이벤트 수정에 실패했습니다.');
      }
    } catch (error) {
      console.error('이벤트 수정 실패:', error);
      alert('이벤트 수정 중 오류가 발생했습니다.');
    }
  };

  // 이벤트 삭제
  const handleDeleteEvent = async () => {
    if (!eventToDelete) return;

    try {
      const response = await fetch(`${URL}/api/events/${eventToDelete.id}`, {
        method: 'DELETE'
      });
      const result = await response.json();

      if (result.success) {
        alert('이벤트가 성공적으로 삭제되었습니다.');
        setDeleteDialogOpen(false);
        setEventToDelete(null);
        fetchEvents(pagination.page); // 현재 페이지 새로고침
      } else {
        alert(result.message || '이벤트 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('이벤트 삭제 실패:', error);
      alert('이벤트 삭제 중 오류가 발생했습니다.');
    }
  };

  // 이벤트 상태 확인
  const getEventStatus = (begin: string, end: string) => {
    const now = new Date();
    const beginDate = new Date(begin);
    const endDate = new Date(end);

    if (now < beginDate) {
      return { status: '예정', color: 'bg-blue-500', icon: <Clock className="h-3 w-3" /> };
    } else if (now >= beginDate && now <= endDate) {
      return { status: '진행중', color: 'bg-green-500', icon: <CheckCircle className="h-3 w-3" /> };
    } else {
      return { status: '종료', color: 'bg-gray-500', icon: <XCircle className="h-3 w-3" /> };
    }
  };

  // 수정 폼 초기화
  const openEditDialog = (event: Event) => {
    setSelectedEvent({ ...event, problems: [] });
    setEditForm({
      title: event.title,
      desc: event.desc || '',
      begin: event.begin.slice(0, 16),
      end: event.end.slice(0, 16),
      problems: '' // 문제는 상세 조회 후 설정
    });
    
    // 문제 목록도 함께 가져오기
    fetchEventDetail(event.id);
    setEditDialogOpen(true);
  };

  // 문제 목록 가져온 후 폼에 설정
  useEffect(() => {
    if (selectedEvent && selectedEvent.problems && selectedEvent.problems.length > 0) {
      setEditForm(prev => ({
        ...prev,
        problems: selectedEvent.problems.join(', ')
      }));
    }
  }, [selectedEvent]);

  // 날짜 포맷팅 (간단하게)
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">이벤트 목록을 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
              <div>
          <h2 className="text-3xl font-bold tracking-tight">이벤트 목록</h2>
          <p className="text-muted-foreground">
            전체 {pagination.total}개의 이벤트를 관리할 수 있습니다.
          </p>
        </div>

      {/* 이벤트 목록 */}
      <div className="space-y-2">
        {events.map((event) => {
          const eventStatus = getEventStatus(event.begin, event.end);
          return (
            <div key={event.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              {/* 이벤트 정보 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-lg truncate">{event.title}</h3>
                  <Badge className={`${eventStatus.color} text-white text-xs`}>
                    {eventStatus.icon}
                    <span className="ml-1">{eventStatus.status}</span>
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {event.problem_count}문제
                  </Badge>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(event.begin)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDate(event.end)}</span>
                  </div>
                  {event.desc && (
                    <span className="truncate max-w-xs">{event.desc}</span>
                  )}
                </div>
              </div>
              
              {/* 액션 버튼 */}
              <div className="flex items-center gap-2 ml-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(event)}
                  className="h-8 px-3"
                >
                  <Edit className="mr-1 h-3 w-3" />
                  수정
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEventToDelete(event);
                    setDeleteDialogOpen(true);
                  }}
                  className="h-8 px-3 text-red-600 hover:text-red-700"
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  삭제
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 페이지네이션 */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchEvents(pagination.page - 1)}
            disabled={pagination.page <= 1}
          >
            이전
          </Button>
          <span className="text-sm">
            {pagination.page} / {pagination.total_pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchEvents(pagination.page + 1)}
            disabled={pagination.page >= pagination.total_pages}
          >
            다음
          </Button>
        </div>
      )}

      {/* 이벤트 수정 다이얼로그 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>이벤트 수정</DialogTitle>
            <DialogDescription>
              이벤트 정보를 수정하세요.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">제목 *</Label>
                <Input
                  id="title"
                  placeholder="이벤트 제목"
                  value={editForm.title}
                  onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="begin">시작일시 *</Label>
                <Input
                  id="begin"
                  type="datetime-local"
                  value={editForm.begin}
                  onChange={(e) => setEditForm(prev => ({ ...prev, begin: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="end">종료일시 *</Label>
                <Input
                  id="end"
                  type="datetime-local"
                  value={editForm.end}
                  onChange={(e) => setEditForm(prev => ({ ...prev, end: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="problems">문제 번호</Label>
                <Input
                  id="problems"
                  placeholder="쉼표로 구분 (예: 1000, 1001, 1002)"
                  value={editForm.problems}
                  onChange={(e) => setEditForm(prev => ({ ...prev, problems: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="desc">설명</Label>
              <Textarea
                id="desc"
                placeholder="이벤트 설명"
                rows={3}
                value={editForm.desc}
                onChange={(e) => setEditForm(prev => ({ ...prev, desc: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleEditEvent}>
              수정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              이벤트 삭제 확인
            </DialogTitle>
            <DialogDescription>
              <strong>"{eventToDelete?.title}"</strong> 이벤트를 정말 삭제하시겠습니까?
              <br />
              이 작업은 되돌릴 수 없으며, 관련된 모든 문제 정보도 함께 삭제됩니다.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleDeleteEvent}>
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventList; 