"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { MENU } from "@/lib/menu";

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
      <div className="flex h-16 items-center px-6 text-lg font-bold">재정관리시스템</div>
      <nav className="px-3 pb-6 text-sm">
        {MENU.map((g) => {
          const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[g.icon] ?? Icons.Circle;
          return (
            <div key={g.label} className="mb-3">
              <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase text-slate-400">
                <Icon size={14} /> {g.label}
              </div>
              {g.items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className={`block rounded-md px-3 py-1.5 ${path.startsWith(i.href) ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
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
