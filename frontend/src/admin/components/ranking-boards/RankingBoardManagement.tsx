import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Eye, Power, RefreshCw, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRankingBoardDetail, getRankingBoards, setRankingBoardActive } from "./api";
import type { RankingBoard, RankingBoardDetail, RankingBoardPage } from "./api";

const INITIAL_PAGE: RankingBoardPage = { boards: [], page: 1, limit: 10, total: 0, totalPages: 0 };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatKst(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "날짜 정보 없음";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(date);
}

function BoardStateBadge({ isActive }: { readonly isActive: boolean }) {
  return <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "활성" : "비활성"}</Badge>;
}

export function RankingBoardManagement() {
  const [page, setPage] = useState(INITIAL_PAGE);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<RankingBoard | null>(null);
  const [detail, setDetail] = useState<RankingBoardDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [confirmBoard, setConfirmBoard] = useState<RankingBoard | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);

  const loadList = useCallback(async (requestedPage: number) => {
    const requestId = listRequest.current + 1;
    listRequest.current = requestId;
    setLoading(true);
    setListError(null);
    try {
      const result = await getRankingBoards(requestedPage);
      if (listRequest.current === requestId) setPage(result);
    } catch (error: unknown) {
      if (listRequest.current === requestId) setListError(errorMessage(error, "추첨 보드 목록을 불러오지 못했습니다."));
    } finally {
      if (listRequest.current === requestId) setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (board: RankingBoard) => {
    const requestId = detailRequest.current + 1;
    detailRequest.current = requestId;
    setSelectedBoard(board);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const result = await getRankingBoardDetail(board.id);
      if (detailRequest.current === requestId) {
        setSelectedBoard(result.board);
        setDetail(result);
      }
    } catch (error: unknown) {
      if (detailRequest.current === requestId) setDetailError(errorMessage(error, "추첨 보드 상세를 불러오지 못했습니다."));
    } finally {
      if (detailRequest.current === requestId) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList(1);
    return () => {
      listRequest.current += 1;
      detailRequest.current += 1;
    };
  }, [loadList]);

  const saveActiveState = async () => {
    if (confirmBoard === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      await setRankingBoardActive(confirmBoard.id, !confirmBoard.isActive);
      setConfirmBoard(null);
      await loadList(page.page);
      await loadDetail(confirmBoard);
    } catch (error: unknown) {
      setSaveError(errorMessage(error, "추첨 보드 상태를 변경하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">추첨 보드 관리</h2>
        <p className="text-muted-foreground">월간 추첨 보드를 확인하고 홈페이지에 표시할 보드를 선택합니다.</p>
      </div>
      <Button variant="outline" onClick={() => void loadList(page.page)} disabled={loading} aria-label="추첨 보드 목록 새로고침">
        <RefreshCw className={loading ? "animate-spin" : undefined} /> 새로고침
      </Button>
    </div>

    {listError !== null ? <Card><CardContent className="space-y-3 pt-6"><p className="text-destructive" role="alert">{listError}</p><Button variant="outline" onClick={() => void loadList(page.page)}>다시 시도</Button></CardContent></Card> : null}

    <Card>
      <CardHeader><CardTitle>추첨 보드 목록</CardTitle><CardDescription>최신 생성 순 · 총 {page.total}개</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="py-8 text-center text-muted-foreground">추첨 보드를 불러오는 중입니다.</p> : page.boards.length === 0 ? <p className="py-8 text-center text-muted-foreground">생성된 추첨 보드가 없습니다.</p> : <Table>
          <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>제목</TableHead><TableHead>생성일 (KST)</TableHead><TableHead>참여자</TableHead><TableHead>상태</TableHead><TableHead><span className="sr-only">상세 보기</span></TableHead></TableRow></TableHeader>
          <TableBody>{page.boards.map((board) => <TableRow key={board.id} data-state={selectedBoard?.id === board.id ? "selected" : undefined}>
            <TableCell>{board.id}</TableCell><TableCell className="max-w-48 truncate font-medium">{board.title ?? "제목 없음"}</TableCell><TableCell>{formatKst(board.createdAt)}</TableCell><TableCell>{board.memberCount}명</TableCell><TableCell><BoardStateBadge isActive={board.isActive} /></TableCell>
            <TableCell><Button variant="outline" size="sm" onClick={() => void loadDetail(board)}><Eye /> 상세 보기</Button></TableCell>
          </TableRow>)}</TableBody>
        </Table>}
        <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{page.totalPages > 0 ? `${page.page} / ${page.totalPages} 페이지` : ""}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={loading || page.page <= 1} onClick={() => void loadList(page.page - 1)} aria-label="이전 페이지"><ChevronLeft /></Button><Button variant="outline" size="sm" disabled={loading || page.totalPages === 0 || page.page >= page.totalPages} onClick={() => void loadList(page.page + 1)} aria-label="다음 페이지"><ChevronRight /></Button></div></div>
      </CardContent>
    </Card>

    {selectedBoard !== null ? <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4"><div className="space-y-1"><CardTitle>{selectedBoard.title ?? "제목 없음"}</CardTitle><CardDescription>보드 #{selectedBoard.id} · {formatKst(selectedBoard.createdAt)}</CardDescription></div><BoardStateBadge isActive={selectedBoard.isActive} /></CardHeader>
      <CardContent className="space-y-4">
        {detailLoading ? <p className="py-6 text-center text-muted-foreground">참여자 목록을 불러오는 중입니다.</p> : null}
        {detailError !== null ? <div className="flex flex-wrap items-center gap-3"><p className="text-destructive" role="alert">{detailError}</p><Button variant="outline" size="sm" onClick={() => void loadDetail(selectedBoard)}>다시 시도</Button></div> : null}
        {detail !== null ? <><div className="flex items-center gap-2 text-sm text-muted-foreground"><Users /> 참여자 {detail.members.length}명</div>{detail.members.length === 0 ? <p className="py-4 text-center text-muted-foreground">참여자가 없습니다.</p> : <Table><TableHeader><TableRow><TableHead>순위</TableHead><TableHead>사용자</TableHead><TableHead>티어</TableHead></TableRow></TableHeader><TableBody>{detail.members.map((member) => <TableRow key={`${member.rank}-${member.userId}`}><TableCell className="font-semibold">{member.rank}</TableCell><TableCell>{member.jungolName}</TableCell><TableCell>{member.tier}</TableCell></TableRow>)}</TableBody></Table>}</> : null}
        {detail !== null && detailError === null ? <Button variant={selectedBoard.isActive ? "outline" : "default"} disabled={saving || detailLoading} onClick={() => { setSaveError(null); setConfirmBoard(selectedBoard); }}><Power /> {selectedBoard.isActive ? "비활성화" : "활성화"}</Button> : null}
      </CardContent>
    </Card> : null}

    <Dialog open={confirmBoard !== null} onOpenChange={(open) => { if (!open && !saving) { setSaveError(null); setConfirmBoard(null); } }}><DialogContent><DialogHeader><DialogTitle>{confirmBoard?.isActive ? "추첨 보드를 비활성화할까요?" : "추첨 보드를 활성화할까요?"}</DialogTitle><DialogDescription>{confirmBoard?.isActive ? "이 보드는 홈페이지 지난달 추첨에 더 이상 표시되지 않습니다." : "다른 활성 보드는 자동으로 비활성화되며, 홈페이지 지난달 추첨이 이 보드로 변경됩니다."}</DialogDescription></DialogHeader>{saveError !== null ? <p className="text-destructive text-sm" role="alert">{saveError}</p> : null}<DialogFooter><Button variant="outline" disabled={saving} onClick={() => { setSaveError(null); setConfirmBoard(null); }}>취소</Button><Button variant={confirmBoard?.isActive ? "destructive" : "default"} disabled={saving} onClick={() => void saveActiveState()}>{saving ? "저장 중..." : <><Check /> 확인</>}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
