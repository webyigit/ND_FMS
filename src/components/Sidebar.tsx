"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faWonSign } from "@fortawesome/free-solid-svg-icons";
import { MENU, findMenu } from "@/lib/menu";
import { useMenuOpen } from "@/lib/menuState";

export default function Sidebar() {
  const path = usePathname();
  const { isOpen, toggle, allOpen, setAll, openFor } = useMenuOpen();
  const cur = findMenu(path);
  // 다른 화면으로 가면 그 메뉴가 속한 묶음은 펼쳐서 현재 위치가 보이게
  useEffect(() => { if (cur && !isOpen(cur.group.label)) openFor(cur.group.label); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <aside className="hidden w-[270px] shrink-0 bg-surface shadow-card lg:block">
      <div className="flex h-[72px] items-center gap-2 px-6 text-lg font-bold text-heading"><span className="flex h-8 w-8 items-center justify-center rounded-base bg-primary text-sm text-white"><FontAwesomeIcon icon={faWonSign} /></span>재정관리시스템</div>
      <nav className="px-4 pb-6">
        <div className="mb-1 flex justify-end px-2">
          <span className="flex overflow-hidden rounded border text-[11px] text-label">
            <button type="button" onClick={() => setAll(true)} disabled={allOpen} className="px-2 py-0.5 hover:text-primary disabled:bg-surface-2 disabled:text-muted">전체 펼침</button>
            <button type="button" onClick={() => setAll(false)} className="border-l px-2 py-0.5 hover:text-primary">전체 닫기</button>
          </span>
        </div>
        {MENU.map((g) => {
          const open = isOpen(g.label);
          return (
            <div key={g.label} className="mb-3">
              <button type="button" onClick={() => toggle(g.label)} aria-expanded={open}
                className="flex w-full items-center gap-2 px-4 pb-1 pt-3 text-left text-[11px] uppercase tracking-[1px] text-label hover:text-primary">
                <FontAwesomeIcon icon={g.icon} className="w-3.5" /> {g.label}
                <FontAwesomeIcon icon={faChevronRight} className={`ml-auto w-2.5 transition-transform ${open ? "rotate-90" : ""}`} />
              </button>
              {open && g.items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className={`block rounded-menu px-4 py-2 font-medium ${cur?.item.href === i.href ? "bg-primary-subtle text-primary" : "text-heading hover:text-primary"}`}
                >
                  {i.label}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
