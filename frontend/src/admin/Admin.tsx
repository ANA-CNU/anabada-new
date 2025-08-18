import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EventAdd } from "./components/EventAdd";
import ScoreManagement from "./components/ScoreManagement";
import EventList from "./components/EventList";
import { URL } from "@/resource/constant";

function Admin() {
  console.log("🔧 Admin 컴포넌트 렌더링 시작");
  
  const [activeSection, setActiveSection] = useState("dashboard");
  const navigate = useNavigate();

  const handleLogout = () => {
    // httpOnly 쿠키는 서버에서만 삭제 가능하므로
    // 서버에 요청을 보내거나, 그냥 리다이렉트만 해도 됨
    // 서버에서 인증 체크할 때 쿠키가 없으면 자동으로 로그인 페이지로 보냄
    
    // 방법 1: 서버에 로그아웃 요청 (권장)
    fetch("/logout", {
      method: "POST",
      credentials: "include",
    }).catch(error => {
      console.error("로그아웃 요청 실패:", error);
    });
    
    // 방법 2: 그냥 리다이렉트 (간단하지만 쿠키는 남아있음)
    // navigate("/login");
    
    // 로그인 페이지로 리다이렉트
    navigate("/login");
  };

  // 유저 이름 목록 상태
  const [nameList, setNameList] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${URL}/api/users/all`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (!mounted) return;
        if (json?.success && Array.isArray(json?.data)) {
          const names = json.data.map((u: any) => u.name).filter((n: any) => typeof n === 'string');
          setNameList(names);
        } else {
          console.warn('유저 목록 조회 실패:', json?.message);
        }
      } catch (err) {
        console.error('유저 목록 불러오기 오류:', err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const menuItems = [
    {
      title: "유저 점수 관리",
      icon: <Users className="h-4 w-4" />,
      items: [
        { name: "유저 목록", icon: <UserCheck className="h-4 w-4" />, id: "user-list" },
        { name: "점수 관리", icon: <Award className="h-4 w-4" />, id: "score-status" },
        { name: "로그 관리", icon: <Star className="h-4 w-4" />, id: "ranking" },
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
                  <div className="text-2xl font-bold">1,234</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">활성 이벤트</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">5</div>
                </CardContent>
              </Card>
            </div>
          </div>
        );
      case "score-status":
        return <ScoreManagement nameList={nameList} />;
      case "event-list":
        return <EventList />;
      case "event-stats":
        return <EventAdd />;
      default:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                {activeSection === "user-list" && "유저 목록"}
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

  try {
    return (
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <div className="w-64 border-r bg-background">
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex h-16 items-center border-b px-6">
              <h1 className="text-xl font-bold">Anabada</h1>
            </div>
            
            {/* Navigation */}
            <div className="flex-1 overflow-auto p-4">
              <div className="space-y-4">
                <Button
                  variant={activeSection === "dashboard" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setActiveSection("dashboard")}
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
                        onClick={() => setActiveSection(item.id)}
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
                <Button 
                  variant="ghost" 
                  className="w-full justify-start"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  로그아웃
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="container mx-auto p-6">
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