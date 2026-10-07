"use client";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faListCheck } from "@fortawesome/free-solid-svg-icons";
import { localDate, sortTodos, todoActions, useTodos } from "@/lib/todo";

// 미완료 TODO가 있으면 모든 관리자 화면 상단에 항상 보여준다
export default function PendingTodos() {
  const pending = sortTodos(useTodos().filter((t) => !t.done));
  if (!pending.length) return null;
  const today = localDate();
  return (
    <div className="no-print border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href="/todo" className="font-semibold text-amber-800">
          <FontAwesomeIcon icon={faListCheck} className="mr-1" />미완료 {pending.length}건
        </Link>
        {pending.slice(0, 5).map((t) => (
          <label key={t.id} className="flex items-center gap-1.5 text-slate-700">
            <input type="checkbox" onChange={() => todoActions.toggle(t.id)} />
            <span className={t.date < today ? "font-semibold text-red-600" : "text-label"}>{t.date.slice(5)}</span>
            {t.text}
          </label>
        ))}
        {pending.length > 5 && <Link href="/todo" className="text-amber-800">외 {pending.length - 5}건</Link>}
      </div>
    </div>
  );
}
