"use client";
import { usePathname } from "next/navigation";
import { findMenu } from "@/lib/menu";

export default function PageHeader({ actions }: { actions?: React.ReactNode }) {
  const m = findMenu(usePathname());
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="text-xs text-muted">{m?.group.label} / {m?.item.label}</div>
        <h1 className="whitespace-nowrap text-[18px] font-semibold text-heading">{m?.item.label}</h1>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
