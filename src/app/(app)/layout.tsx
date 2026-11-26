import TopNav from "@/components/TopNav";
import Sidebar from "@/components/Sidebar";
import PendingTodos from "@/components/PendingTodos";
import PendingRequests from "@/components/PendingRequests";
import AccessLogger from "@/components/AccessLogger";
import WeeklySteps from "@/components/WeeklySteps";

// 화면 틀(2026-11-26 개편): 상단 GNB(1depth) → 알림 줄 → 좌측 2depth 메뉴 + 본문 → 하단 업무 흐름 바
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <AccessLogger />
      <TopNav />
      <PendingRequests />
      <PendingTodos />
      <div className="flex min-w-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 px-4 py-5 lg:px-8 lg:py-6">{children}</main>
          <WeeklySteps />
        </div>
      </div>
    </div>
  );
}
