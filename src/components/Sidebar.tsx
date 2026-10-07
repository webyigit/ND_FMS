"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWonSign } from "@fortawesome/free-solid-svg-icons";
import { MENU } from "@/lib/menu";

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden w-[270px] shrink-0 bg-surface shadow-card lg:block">
      <div className="flex h-[72px] items-center gap-2 px-6 text-lg font-bold text-heading"><span className="flex h-8 w-8 items-center justify-center rounded-base bg-primary text-sm text-white"><FontAwesomeIcon icon={faWonSign} /></span>재정관리시스템</div>
      <nav className="px-4 pb-6">
        {MENU.map((g) => {
          return (
            <div key={g.label} className="mb-3">
              <div className="flex items-center gap-2 px-4 pb-1 pt-3 text-[11px] uppercase tracking-[1px] text-label">
                <FontAwesomeIcon icon={g.icon} className="w-3.5" /> {g.label}
              </div>
              {g.items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className={`block rounded-menu px-4 py-2 font-medium ${path.startsWith(i.href) ? "bg-primary-subtle text-primary" : "text-heading hover:text-primary"}`}
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
