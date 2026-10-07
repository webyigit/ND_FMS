"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBullhorn, faHouse, faListUl, faPenToSquare, faWallet } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isDbConfigured } from "@/lib/supabase/config";

type NavItem = { href: string; label: string; icon?: IconDefinition };

/** 부서장 모바일 아래 메뉴 */
export const DEPT_NAV: NavItem[] = [
  { href: "/m", label: "홈", icon: faHouse },
  { href: "/m/budget", label: "예산·지출", icon: faWallet },
  { href: "/m/expense/new", label: "지출신청", icon: faPenToSquare },
  { href: "/m/expense", label: "내 신청", icon: faListUl },
  { href: "/m/notice", label: "공지", icon: faBullhorn },
];

// 외부 노출용(부서장·지출신청·기부금영수증 신청) 모바일 레이아웃. 관리자 메뉴로 이동 불가.
// nav="dept": 부서장 메뉴(서버 페이지에서도 쓸 수 있게 이름으로 받는다)
export default function MobileShell({ title, nav: navProp, account, children }: { title: string; nav?: NavItem[] | "dept"; account?: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const nav = navProp === "dept" ? DEPT_NAV : navProp;
  // 가장 길게 맞는 메뉴 하나만 켠다(/m/expense/new 에서 '내 신청'이 같이 켜지지 않게)
  const active = nav?.filter((n) => path === n.href || path.startsWith(n.href + "/")).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const logout = async () => { await supabaseBrowser()?.auth.signOut(); location.replace("/m/login"); };
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-bg">
      <header className="sticky top-0 z-10 flex items-center border-b border-line bg-surface px-4 py-3">
        <span className="flex-1 text-base font-bold text-heading">{title}</span>
        {account && isDbConfigured && <button onClick={logout} className="text-xs text-label">로그아웃</button>}
      </header>
      <main className="flex-1 p-4">{children}</main>
      {nav && (
        <nav className="sticky bottom-0 grid border-t border-line bg-surface text-center text-xs" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-1 py-2.5 ${active === n.href ? "font-semibold text-primary" : "text-label"}`}>
              {n.icon && <FontAwesomeIcon icon={n.icon} className="text-base" />}{n.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export function Spec({ items }: { items: string[] }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface p-4 text-sm text-label">
      <div className="mb-2 font-semibold">구현 예정</div>
      <ul className="list-disc space-y-1 pl-5">{items.map((s) => <li key={s}>{s}</li>)}</ul>
    </div>
  );
}

/** 모바일 화면 공통 카드·입력 */
export const mCard = "rounded-lg bg-surface p-4 shadow-card";
export const mInput = "mt-1 w-full rounded border px-3 py-2 text-base text-heading";
export const mButton = "w-full rounded bg-primary py-3 text-sm font-medium text-white disabled:opacity-60";

/** 데모 모드 안내(로그인·DB가 필요한 화면) */
export function DemoOnly({ what }: { what: string }) {
  return <div className="rounded bg-warning-subtle px-3 py-2 text-sm text-warning">데모 모드예요. DB를 연결하면 {what}을(를) 쓸 수 있어요.</div>;
}
