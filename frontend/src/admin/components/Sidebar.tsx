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
import { 
  Sidebar, 
  SidebarHeader, 
  SidebarFooter,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton
} from "@/components/ui/sidebar";

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function AdminSidebar({ activeSection, onSectionChange }: SidebarProps) {
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

  return (
    <div className="w-72 border-r bg-background overflow-hidden">
      <Sidebar className="h-full overflow-y-auto">
        <SidebarHeader>
          <div className="text-xl font-bold">
            Anabada
          </div>
        </SidebarHeader>
        
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeSection === "dashboard"}
                onClick={() => onSectionChange("dashboard")}
              >
                <BarChart3 className="h-4 w-4" />
                <span className="truncate">대시보드</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <Separator />
            
            {menuItems.map((section, sectionIndex) => (
              <SidebarGroup key={sectionIndex}>
                <SidebarGroupLabel>
                  <div className="flex items-center">
                    {section.icon}
                    <span className="ml-2 truncate">{section.title}</span>
                  </div>
                </SidebarGroupLabel>
                
                {section.items.map((item, itemIndex) => (
                  <SidebarMenuItem key={itemIndex}>
                    <SidebarMenuButton
                      isActive={activeSection === item.id}
                      onClick={() => onSectionChange(item.id)}
                    >
                      {item.icon}
                      <span className="ml-2 truncate">{item.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                
                {sectionIndex < menuItems.length - 1 && <Separator />}
              </SidebarGroup>
            ))}
          </SidebarMenu>
        </SidebarContent>
        
        <SidebarFooter>
          <div className="space-y-2">
            <Separator className="my-4" />
            <SidebarMenuButton>
              <Settings className="h-4 w-4" />
              <span className="truncate">설정</span>
            </SidebarMenuButton>
            <SidebarMenuButton>
              <LogOut className="h-4 w-4" />
              <span className="truncate">로그아웃</span>
            </SidebarMenuButton>
          </div>
        </SidebarFooter>
      </Sidebar>
    </div>
  );
} 