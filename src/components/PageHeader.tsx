"use client";
import { usePathname } from "next/navigation";
import { findMenu } from "@/lib/menu";

export default function PageHeader({ actions }: { actions?: React.ReactNode }) {
  const m = findMenu(usePathname());
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <div className="text-xs text-slate-400">{m?.group.label}</div>
        <h1 className="text-xl font-bold">{m?.item.label}</h1>
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}
