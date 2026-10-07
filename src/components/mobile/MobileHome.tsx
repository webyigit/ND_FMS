"use client";
import Link from "next/link";
import MobileShell, { DemoOnly, mCard } from "./MobileShell";
import NoticeList from "@/components/NoticeList";
import { useDbQuery, must } from "@/lib/db/useDb";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMe } from "@/lib/work/me";
import { barWidth, summarizeBudget, type BudgetRow } from "@/lib/work/requests";
import { pct, thisYear, won } from "@/lib/format";

/** 연도별 내 부서 예산·지출 (항목별) */
export function useDeptBudget(year: number) {
  return useDbQuery(async (sb) => summarizeBudget(must(await sb.rpc("dept_budget_status", { p_year: year })) as BudgetRow[]), [year]);
}

// 부서장 홈: 내 부서 예산·지출·잔액·집행률, 최근 공지
export default function MobileHome() {
  const year = thisYear();
  const me = useMe();
  const q = useDeptBudget(year);
  const demo = !supabaseBrowser();
  return (
    <MobileShell title="부서장" nav="dept" account>
      {demo && <div className="mb-3"><DemoOnly what="부서 예산·지출 조회와 신청" /></div>}
      {me.data && <div className="mb-3 text-sm text-label"><b className="text-heading">{me.data.name}</b>님, 안녕하세요.</div>}

      <div className="mb-2 text-sm font-semibold text-heading">{year}년 내 부서</div>
      {q.error && <div className="mb-3 rounded bg-danger-subtle px-3 py-2 text-sm text-danger">{q.error}</div>}
      {!demo && q.loading && <div className="mb-3 text-sm text-muted">불러오는 중…</div>}
      {q.data && !q.data.length && <div className={`${mCard} mb-3 text-sm text-label`}>연결된 부서가 없어요. 재정부에 부서 연결을 요청해 주세요.</div>}
      <div className="mb-4 space-y-3">
        {q.data?.map((d) => (
          <Link key={d.id} href={`/m/budget?dept=${d.id}`} className={`${mCard} block`}>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-semibold text-heading">{d.name}</span>
              <span className="text-xs text-label">집행률 {pct(d.spent, d.budget)}</span>
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className={`h-full rounded-full ${d.rate != null && d.rate > 1 ? "bg-danger" : "bg-primary"}`} style={{ width: `${barWidth(d.rate)}%` }} />
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center text-xs">
              <div><dt className="text-muted">예산</dt><dd className="mt-0.5 text-sm font-semibold text-heading">{won(d.budget)}</dd></div>
              <div><dt className="text-muted">지출</dt><dd className="mt-0.5 text-sm font-semibold text-heading">{won(d.spent)}</dd></div>
              <div><dt className="text-muted">잔액</dt><dd className={`mt-0.5 text-sm font-semibold ${d.balance < 0 ? "text-danger" : "text-success"}`}>{won(d.balance)}</dd></div>
            </dl>
          </Link>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <Link href="/m/expense/new" className="rounded bg-primary py-3 text-center font-medium text-white">지출 신청</Link>
        <Link href="/m/budget-request" className="rounded border border-line bg-surface py-3 text-center font-medium text-heading">예산 신청</Link>
      </div>

      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-semibold text-heading">최근 공지</span>
        <Link href="/m/notice" className="text-xs text-label">더보기</Link>
      </div>
      <NoticeList channel="dept_head" limit={3} />
    </MobileShell>
  );
}
