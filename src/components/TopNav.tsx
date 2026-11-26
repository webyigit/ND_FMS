"use client";
// 상단 GNB: 로고 + 1depth 메뉴(묶음) + 동기화·사용자. 넓은 화면(lg 이상)에서 메뉴를 가로로, 좁은 화면은 햄버거(MobileNav).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWonSign } from "@fortawesome/free-solid-svg-icons";
import { MENU, findMenu } from "@/lib/menu";
import MobileNav from "@/components/MobileNav";
import SyncStatus from "@/components/SyncStatus";
import UserMenu from "@/components/UserMenu";

export default function TopNav() {
  const cur = findMenu(usePathname());
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-surface">
      <div className="flex h-14 items-center gap-2 px-3 lg:gap-6 lg:px-6">
        <MobileNav />
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2 font-bold text-heading">
          <span className="flex h-7 w-7 items-center justify-center rounded-base bg-primary text-xs text-white"><FontAwesomeIcon icon={faWonSign} /></span>
          <span className="text-[15px]">재정관리시스템</span>
        </Link>
        <nav aria-label="주 메뉴" className="hidden h-full min-w-0 flex-1 items-stretch overflow-x-auto lg:flex">
          {MENU.map((g) => {
            const on = cur?.group.label === g.label;
            return (
              <Link key={g.label} href={g.items[0].href} aria-current={on ? "page" : undefined}
                className={`relative flex shrink-0 items-center whitespace-nowrap rounded-none px-3 text-[13px] xl:px-3.5 ${on ? "font-semibold text-primary" : "text-label hover:text-heading"}`}>
                {g.label}
                {on && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-primary" />}
              </Link>
            );
          })}
        </nav>
        <span className="ml-auto flex shrink-0 items-center gap-3 lg:ml-0"><SyncStatus /><UserMenu /></span>
      </div>
    </header>
  );
}
