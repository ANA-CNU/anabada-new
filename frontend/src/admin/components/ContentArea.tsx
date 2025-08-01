import { Dashboard } from "./Dashboard";
import { EventAdd } from "./EventAdd";

interface ContentAreaProps {
  activeSection: string;
}

export function ContentArea({ activeSection }: ContentAreaProps) {
  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return <Dashboard />;
      case "event-stats":
        return <EventAdd />;
      default:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                {activeSection === "user-list" && "유저 목록"}
                {activeSection === "score-status" && "점수 현황"}
                {activeSection === "ranking" && "랭킹 관리"}
                {activeSection === "activity-log" && "활동 로그"}
                {activeSection === "system-log" && "시스템 로그"}
                {activeSection === "access-log" && "접속 기록"}
                {activeSection === "event-list" && "이벤트 목록"}
                {activeSection === "event-stats" && "이벤트 통계"}
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

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto p-6">
        {renderContent()}
      </div>
    </div>
  );
} 