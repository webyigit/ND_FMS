import Link from "next/link";

// 외부 노출용(부서장·지출신청·기부금영수증 신청) 모바일 레이아웃. 관리자 메뉴로 이동 불가.
export default function MobileShell({ title, nav, children }: { title: string; nav?: { href: string; label: string }[]; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 text-base font-bold">{title}</header>
      <main className="flex-1 p-4">{children}</main>
      {nav && (
        <nav className="sticky bottom-0 grid border-t border-slate-200 bg-white text-center text-xs" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
          {nav.map((n) => <Link key={n.href} href={n.href} className="py-3 text-slate-600">{n.label}</Link>)}
        </nav>
      )}
    </div>
  );
}

export function Spec({ items }: { items: string[] }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
      <div className="mb-2 font-semibold">구현 예정</div>
      <ul className="list-disc space-y-1 pl-5">{items.map((s) => <li key={s}>{s}</li>)}</ul>
    </div>
  );
}
