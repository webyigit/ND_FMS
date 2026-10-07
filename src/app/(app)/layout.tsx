import Sidebar from "@/components/Sidebar";
import PendingTodos from "@/components/PendingTodos";
import MobileNav from "@/components/MobileNav";
import UserMenu from "@/components/UserMenu";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] items-center justify-between bg-surface px-4 text-label shadow-card lg:justify-end lg:px-6">
          <MobileNav />
          <UserMenu />
        </header>
        <PendingTodos />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
