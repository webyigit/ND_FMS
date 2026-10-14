"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faChevronRight, faXmark } from "@fortawesome/free-solid-svg-icons";
import { MENU, findMenu } from "@/lib/menu";
import { STEPS_KEY, useMenuOpen } from "@/lib/menuState";
import WeeklySteps from "./WeeklySteps";

// 폰·태블릿(사이드바가 숨는 폭)에서 쓰는 전체 메뉴
export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const { isOpen, toggle, allOpen, setAll } = useMenuOpen();
  const cur = findMenu(path);
  return (
    <div className="lg:hidden">
      <button onClick={() => setOpen(true)} aria-label="메뉴 열기" className="px-2 py-1 text-lg text-slate-600"><FontAwesomeIcon icon={faBars} /></button>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <nav className="h-full w-72 overflow-y-auto bg-surface p-3 text-sm shadow-xl">
            <div className="mb-2 flex items-center justify-between px-3 py-2 font-bold">재정관리시스템
              <span className="flex items-center gap-2">
                <span className="flex overflow-hidden rounded border text-[11px] font-normal text-label">
                  <button type="button" onClick={() => setAll(true)} disabled={allOpen} className="px-2 py-0.5 disabled:bg-surface-2 disabled:text-muted">전체 펼침</button>
                  <button type="button" onClick={() => setAll(false)} className="border-l px-2 py-0.5">전체 닫기</button>
                </span>
                <button onClick={() => setOpen(false)} aria-label="메뉴 닫기" className="text-label"><FontAwesomeIcon icon={faXmark} /></button>
              </span></div>
            <WeeklySteps open={isOpen(STEPS_KEY)} onToggle={() => toggle(STEPS_KEY)} onNavigate={() => setOpen(false)} />
            {MENU.map((g) => {
              const gOpen = isOpen(g.label) || g.label === cur?.group.label;
              return (
                <div key={g.label} className="mb-2">
                  <button type="button" onClick={() => toggle(g.label)} aria-expanded={gOpen} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold text-muted">
                    <FontAwesomeIcon icon={g.icon} className="w-3.5" /> {g.label}
                    <FontAwesomeIcon icon={faChevronRight} className={`ml-auto w-2.5 transition-transform ${gOpen ? "rotate-90" : ""}`} />
                  </button>
                  {gOpen && g.items.map((i) => (
                    <Link key={i.href} href={i.href} onClick={() => setOpen(false)}
                      className={`block rounded-md px-3 py-2 ${cur?.item.href === i.href ? "bg-primary-subtle font-medium text-primary" : "text-heading"}`}>{i.label}</Link>
                  ))}
                </div>
              );
            })}
          </nav>
          <button className="flex-1 bg-black/30" aria-label="메뉴 닫기" onClick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
