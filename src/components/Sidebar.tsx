"use client";
// 좌측 2depth 메뉴: 상단 GNB에서 고른 묶음의 하위 화면만 보여준다(넓은 화면 lg 이상).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { MENU, findMenu } from "@/lib/menu";

export default function Sidebar() {
  const cur = findMenu(usePathname());
  const group = cur?.group ?? MENU[0];
  // 하위 화면이 하나뿐인 묶음(대시보드)은 본문을 넓게 쓰도록 숨긴다
  if (group.items.length < 2) return null;
  return (
    <aside className="no-print hidden w-[220px] shrink-0 border-r border-line bg-surface lg:block">
      <nav aria-label={`${group.label} 메뉴`} className="sticky top-14 px-3 py-5">
        <div className="mb-2 flex items-center gap-2 px-3 text-xs font-semibold text-label">
          <FontAwesomeIcon icon={group.icon} className="w-3.5 text-primary" />{group.label}
        </div>
        {group.items.map((i) => {
          const on = cur?.item.href === i.href;
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
              className={`mb-0.5 block rounded-menu px-3 py-2 text-[13px] ${on ? "bg-primary-subtle font-semibold text-primary" : "text-heading hover:bg-surface-2"}`}>
              {i.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
