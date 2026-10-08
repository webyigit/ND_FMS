import Sidebar from "@/components/Sidebar";
import PendingTodos from "@/components/PendingTodos";
import PendingRequests from "@/components/PendingRequests";
import MobileNav from "@/components/MobileNav";
import UserMenu from "@/components/UserMenu";
import AccessLogger from "@/components/AccessLogger";
import SyncStatus from "@/components/SyncStatus";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <AccessLogger />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] items-center justify-between bg-surface px-4 text-label shadow-card lg:justify-end lg:px-6">
          <MobileNav />
          <span className="flex items-center gap-3"><SyncStatus /><UserMenu /></span>
        </header>
        <PendingRequests />
        <PendingTodos />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
