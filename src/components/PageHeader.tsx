"use client";
import { usePathname } from "next/navigation";
import { findMenu } from "@/lib/menu";

/** printHidden: 출력물에 자체 제목이 있는 장표 화면은 메뉴 제목을 인쇄하지 않는다 */
export default function PageHeader({ actions, printHidden }: { actions?: React.ReactNode; printHidden?: boolean }) {
  const m = findMenu(usePathname());
  return (
    <div className={`mb-6 flex flex-wrap items-center justify-between gap-2${printHidden ? " no-print" : ""}`}>
      <div>
        <div className="text-xs text-muted">{m?.group.label} / {m?.item.label}</div>
        <h1 className="whitespace-nowrap text-[18px] font-semibold text-heading">{m?.item.label}</h1>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
