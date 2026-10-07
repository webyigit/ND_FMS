import Sidebar from "@/components/Sidebar";
import PendingTodos from "@/components/PendingTodos";
import MobileNav from "@/components/MobileNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 text-sm text-slate-500 lg:justify-end lg:px-6">
          <MobileNav />
          {/* 로그인 사용자·알림: 인증 연결 후 */}
          <span>재정부</span>
        </header>
        <PendingTodos />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
