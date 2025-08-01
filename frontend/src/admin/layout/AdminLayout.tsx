import { useState } from "react";
import { AdminSidebar } from "../components/Sidebar";
import { ContentArea } from "../components/ContentArea";

export function AdminLayout() {
  console.log("🔧 AdminLayout 렌더링 시작");
  
  const [activeSection, setActiveSection] = useState("dashboard");

  try {
    return (
      <div className="flex h-screen bg-background p-4">
        <div className="flex w-full border rounded-lg bg-card overflow-hidden">
          <AdminSidebar 
            activeSection={activeSection} 
            onSectionChange={setActiveSection} 
          />
          <ContentArea activeSection={activeSection} />
        </div>
      </div>
    );
  } catch (error) {
    console.error("❌ AdminLayout 렌더링 오류:", error);
    return <div>Admin 레이아웃 로딩 중 오류가 발생했습니다.</div>;
  }
} 