"use client";
import { useState } from "react";
import Link from "next/link";
import MobileShell, { DemoOnly, mCard } from "./MobileShell";
import { useDeptBudget } from "./MobileHome";
import YearSelect from "@/components/ui/YearSelect";
import { useDbQuery, must } from "@/lib/db/useDb";
import { supabaseBrowser } from "@/lib/supabase/client";
import { pct, thisYear, won } from "@/lib/format";

type Exp = { id: number; sunday: string; expense_item_id: number; item: string; content: string; amount: number; memo: string | null };

// 예산·지출 조회: 항목별 예산·지출·잔액, 지출 내역(일자·내용·금액·비고)
export default function DeptBudget() {
  const [year, setYear] = useState(thisYear);
  const [deptId, setDeptId] = useState<number | null>(() => Number(new URLSearchParams(location.search).get("dept")) || null);
  const [itemId, setItemId] = useState<number | null>(null);
  const q = useDeptBudget(year);
  const dept = q.data?.find((d) => d.id === deptId) ?? q.data?.[0];
  const ex = useDbQuery(async (sb) => (dept ? (must(await sb.rpc("dept_expenses", { p_year: year, p_department_id: dept.id })) as Exp[]) : []), [year, dept?.id]);
  const list = (ex.data ?? []).filter((e) => !itemId || e.expense_item_id === itemId);

  if (!supabaseBrowser()) return <MobileShell title="예산·지출" nav="dept"><DemoOnly what="부서 예산·지출 조회" /></MobileShell>;
  return (
    <MobileShell title="예산·지출" nav="dept" account>
      <div className="mb-3 flex gap-2">
        <YearSelect value={year} onChange={(y) => { setYear(y); setItemId(null); }} />
        {(q.data?.length ?? 0) > 1 && (
          <select value={dept?.id ?? ""} onChange={(e) => { setDeptId(Number(e.target.value)); setItemId(null); }} className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm text-heading">
            {q.data!.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
      </div>
      {q.error && <div className="mb-3 rounded bg-danger-subtle px-3 py-2 text-sm text-danger">{q.error}</div>}
      {q.loading && <div className="text-sm text-muted">불러오는 중…</div>}
      {q.data && !dept && <div className={`${mCard} text-sm text-label`}>연결된 부서가 없어요.</div>}
      {dept && (
        <>
          <div className={`${mCard} mb-3 p-0`}>
            <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
              <span className="font-semibold text-heading">{dept.name}</span>
              <span className="text-xs text-label">잔액 <b className={dept.balance < 0 ? "text-danger" : "text-heading"}>{won(dept.balance)}</b> · 집행률 {pct(dept.spent, dept.budget)}</span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted"><tr><th className="px-4 py-2 text-left font-normal">항목</th><th className="text-right font-normal">예산</th><th className="text-right font-normal">지출</th><th className="px-4 text-right font-normal">잔액</th></tr></thead>
              <tbody>
                {dept.items.map((i) => (
                  <tr key={i.expense_item_id} onClick={() => setItemId(itemId === i.expense_item_id ? null : i.expense_item_id)}
                    className={`cursor-pointer border-t border-line ${itemId === i.expense_item_id ? "bg-primary-subtle" : ""}`}>
                    <td className="px-4 py-2 text-heading">{i.item}</td>
                    <td className="text-right text-label">{won(i.budget)}</td>
                    <td className="text-right text-label">{won(i.spent)}</td>
                    <td className={`px-4 text-right ${i.budget - i.spent < 0 ? "text-danger" : "text-heading"}`}>{won(i.budget - i.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-semibold text-heading">지출 내역{itemId ? ` · ${dept.items.find((i) => i.expense_item_id === itemId)?.item}` : ""}</span>
            <span className="text-xs text-label">{list.length}건 {won(list.reduce((s, e) => s + Number(e.amount), 0))}원</span>
          </div>
          {ex.error && <div className="mb-3 rounded bg-danger-subtle px-3 py-2 text-sm text-danger">{ex.error}</div>}
          <ul className="divide-y divide-line rounded-lg bg-surface text-sm shadow-card">
            {!list.length && <li className="px-4 py-6 text-center text-muted">{ex.loading ? "불러오는 중…" : "지출 내역이 없어요"}</li>}
            {list.map((e) => (
              <li key={e.id} className="px-4 py-2.5">
                <div className="flex justify-between gap-2">
                  <span className="text-heading">{e.content}</span>
                  <span className="shrink-0 font-semibold text-heading">{won(Number(e.amount))}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted">{e.sunday} · {e.item}{e.memo ? ` · ${e.memo}` : ""}</div>
              </li>
            ))}
          </ul>
          <Link href="/m/budget-request" className="mt-4 block rounded border border-line bg-surface py-3 text-center text-sm font-medium text-heading">내년도 예산 신청</Link>
        </>
      )}
    </MobileShell>
  );
}
