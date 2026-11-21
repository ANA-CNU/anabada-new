"use client";

import { useEffect, useState } from "react";
import { 
  Users, 
  History, 
  Calendar, 
  BarChart3, 
  Settings, 
  LogOut,
  UserCheck,
  Award,
  Activity,
  FileText,
  Clock,
  Star,
  TrendingUp,
  AlertCircle,
  Plus,
  ExternalLink,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventAdd } from "./components/EventAdd";
import ScoreManagement from "./components/ScoreManagement";
import EventList from "./components/EventList";
import { URL } from "@/resource/constant";
import LogManagement from "./components/LogManagement";
import BiasManagement from "./components/BiasManagement";
import UserManagement from "./components/UserManagement";
import WebhookManagement from "./components/WebhookManagement";
import type { User } from "@/types";
import { RankingBoardManagement } from "./components/ranking-boards/RankingBoardManagement";
import { loadActiveEventCount, loadAdminUsers } from "./dashboard-api";

const formatCount = (count: number | null | undefined) => {
  if (count === undefined) return "불러오는 중";
  if (count === null) return "조회 실패";
  return count.toLocaleString("ko-KR");
};

function Admin() {

  
  const [activeSection, setActiveSection] = useState("dashboard");
  const [userList, setUserList] = useState<User[] | null>();
  const [activeEventCount, setActiveEventCount] = useState<number | null>();

  useEffect(() => {
    if (activeSection !== "dashboard" && activeSection !== "score-status") return;
    const controller = new AbortController();
    loadAdminUsers(URL, controller.signal).then(setUserList).catch(() => {
      if (!controller.signal.aborted) setUserList(null);
    });
    return () => controller.abort();
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "dashboard") return;
    const controller = new AbortController();
    loadActiveEventCount(URL, controller.signal).then(setActiveEventCount).catch(() => {
      if (!controller.signal.aborted) setActiveEventCount(null);
    });
    return () => controller.abort();
  }, [activeSection]);

  const menuItems = [
    {
      title: "유저 점수 관리",
      icon: <Users className="h-4 w-4" />,
      items: [
        { name: "유저 목록", icon: <UserCheck className="h-4 w-4" />, id: "user-list" },
        { name: "점수 관리", icon: <Award className="h-4 w-4" />, id: "score-status" },
        { name: "로그 관리", icon: <Star className="h-4 w-4" />, id: "log-management" },
        { name: "가중치 관리", icon: <TrendingUp className="h-4 w-4" />, id: "bias-management" },
        { name: "웹훅 관리", icon: <ExternalLink className="h-4 w-4" />, id: "webhook-management" },
      ]
    },
    {
      title: "히스토리 로그 관리",
      icon: <History className="h-4 w-4" />,
      items: [
        { name: "활동 로그", icon: <Activity className="h-4 w-4" />, id: "activity-log" },
        { name: "시스템 로그", icon: <FileText className="h-4 w-4" />, id: "system-log" },
        { name: "접속 기록", icon: <Clock className="h-4 w-4" />, id: "access-log" },
      ]
    },
    {
      title: "이벤트 관리",
      icon: <Calendar className="h-4 w-4" />,
      items: [
        { name: "이벤트 목록", icon: <Calendar className="h-4 w-4" />, id: "event-list" },
        { name: "이벤트 추가", icon: <Plus className="h-4 w-4" />, id: "event-stats" },
        { name: "알림 관리", icon: <AlertCircle className="h-4 w-4" />, id: "notification" },
      ]
    },
    {
      title: "추첨 관리",
      icon: <Trophy className="h-4 w-4" />,
      items: [
        { name: "추첨 보드 관리", icon: <Trophy className="h-4 w-4" />, id: "ranking-boards" },
      ]
    }
  ];

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">대시보드</h2>
              <p className="text-muted-foreground">
                관리자 대시보드입니다.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">총 사용자</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="admin-user-count">{formatCount(userList === null ? null : userList?.length)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">활성 이벤트</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="admin-active-event-count">{formatCount(activeEventCount)}</div>
                </CardContent>
              </Card>
            </div>
          </div>
        );
      case "user-list":
        return <UserManagement />;
      case "score-status":
        return <ScoreManagement userList={userList ?? []} />;
      case "log-management":
        return <LogManagement />;
      case "bias-management":
        return <BiasManagement />;
      case "webhook-management":
        return <WebhookManagement />;
      case "event-list":
        return <EventList />;
      case "event-stats":
        return <EventAdd />;
      case "ranking-boards":
        return <RankingBoardManagement />;
      default:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                {activeSection === "ranking" && "랭킹 관리"}
                {activeSection === "activity-log" && "활동 로그"}
                {activeSection === "system-log" && "시스템 로그"}
                {activeSection === "access-log" && "접속 기록"}
                {activeSection === "notification" && "알림 관리"}
              </h2>
              <p className="text-muted-foreground">
                해당 기능은 추후 구현 예정입니다.
              </p>
            </div>
          </div>
        );
    }
  };

  // 모바일에서 메뉴 클릭 시 사이드바 닫기
  const handleMenuClick = (sectionId: string) => {
    setActiveSection(sectionId);
  };

  try {
    return (
      <div className="flex h-screen bg-background">
        <div className="w-64 shrink-0 border-r bg-background">
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex h-16 items-center justify-between border-b px-6">
              <h1 className="text-xl font-bold">Anabada</h1>
            </div>
            
            {/* Navigation */}
            <div className="flex-1 overflow-auto p-4">
              <div className="space-y-4">
                <Button
                  variant={activeSection === "dashboard" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => handleMenuClick("dashboard")}
                >
                  <BarChart3 className="mr-2 h-4 w-4" />
                  대시보드
                </Button>
                
                <Separator />
                
                {menuItems.map((section, sectionIndex) => (
                  <div key={sectionIndex} className="space-y-2">
                    <div className="px-2 py-1">
                      <h3 className="text-sm font-semibold text-muted-foreground flex items-center">
                        {section.icon}
                        <span className="ml-2">{section.title}</span>
                      </h3>
                    </div>
                    
                    {section.items.map((item, itemIndex) => (
                      <Button
                        key={itemIndex}
                        variant={activeSection === item.id ? "secondary" : "ghost"}
                        className="w-full justify-start pl-8"
                        onClick={() => handleMenuClick(item.id)}
                      >
                        {item.icon}
                        <span className="ml-2">{item.name}</span>
                      </Button>
                    ))}
                    
                    {sectionIndex < menuItems.length - 1 && <Separator />}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Footer */}
            <div className="border-t p-4">
              <div className="space-y-2">
                <Button variant="ghost" className="w-full justify-start">
                  <Settings className="mr-2 h-4 w-4" />
                  설정
                </Button>
                <form action="/auth/logout" method="post">
                  <Button type="submit" variant="ghost" className="w-full justify-start">
                    <LogOut className="mr-2 h-4 w-4" />
                    로그아웃
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="mx-auto p-6">
            {renderContent()}
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("❌ Admin 컴포넌트 렌더링 오류:", error);
    return <div>Admin 페이지 로딩 중 오류가 발생했습니다.</div>;
  }
}

export default Admin;
