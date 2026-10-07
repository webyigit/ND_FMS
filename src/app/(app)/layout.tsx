import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-end border-b border-slate-200 bg-white px-6 text-sm text-slate-500">
          {/* 로그인 사용자·알림: 인증 연결 후 */}
          재정부
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
