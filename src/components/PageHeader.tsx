"use client";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { findMenu } from "@/lib/menu";

/** 화면 머리: 브레드크럼(묶음 › 화면) + 큰 제목 + 우측 상단 액션 버튼.
 *  desc: 제목 아래 한 줄 설명(선택). printHidden: 출력물에 자체 제목이 있는 장표 화면은 메뉴 제목을 인쇄하지 않는다 */
export default function PageHeader({ actions, printHidden, desc }: { actions?: React.ReactNode; printHidden?: boolean; desc?: React.ReactNode }) {
  const m = findMenu(usePathname());
  return (
    <div className={`page-head mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3${printHidden ? " no-print" : ""}`}>
      <div className="min-w-0">
        <nav aria-label="현재 위치" className="no-print mb-1 flex items-center gap-1.5 text-xs text-muted">
          <span>{m?.group.label}</span>
          {m && m.group.label !== m.item.label && <><FontAwesomeIcon icon={faChevronRight} className="w-1.5" /><span className="text-label">{m.item.label}</span></>}
        </nav>
        <h1 className="whitespace-nowrap text-[22px] font-bold leading-tight tracking-[-0.01em] text-heading">{m?.item.label}</h1>
        {desc && <p className="no-print mt-1 text-sm text-label">{desc}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
