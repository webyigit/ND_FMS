"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import DbOnly from "@/components/ui/DbOnly";
import YearSelect from "@/components/ui/YearSelect";
import { ExcelButton, btn, card, input } from "@/components/ui/Buttons";
import { useDbQuery, must } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { downloadXlsx } from "@/lib/excel";
import { fileName, thisYear, won } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { STATUS, type RequestStatus } from "@/lib/work/requests";

type Row = {
  id: number; year: number; amount: number; reason: string | null; status: RequestStatus; requester_name: string | null;
  requested_at: string; review_note: string | null; department: { name: string; sort_order: number | null } | null; expense_item: { name: string } | null;
};

export default function BudgetRequests() {
  return <DbOnly what="예산신청 관리"><Inner /></DbOnly>;
}

// 신청관리 > 예산신청: 부서장이 낸 예산 신청을 승인/반려. 승인 건은 내년도 예산 화면에서 참고한다.
function Inner() {
  const sb = supabaseBrowser()!;
  const [year, setYear] = useState(thisYear() + 1);
  const [tab, setTab] = useState<RequestStatus | "">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const q = useDbQuery(async (s) => {
    let r = s.from("budget_request").select("id, year, amount, reason, status, requester_name, requested_at, review_note, department(name, sort_order), expense_item(name)")
      .eq("year", year).order("requested_at", { ascending: false });
    if (tab) r = r.eq("status", tab);
    return must(await r) as unknown as Row[];
  }, [year, tab]);
  const rows = [...(q.data ?? [])].sort((a, b) => (a.department?.sort_order ?? 0) - (b.department?.sort_order ?? 0));
  const sum = (s?: RequestStatus) => rows.filter((r) => !s || r.status === s).reduce((a, r) => a + Number(r.amount), 0);

  const review = async (r: Row, approve: boolean) => {
    let note: string | null = null;
    if (!approve) {
      note = prompt("반려 사유를 적어 주세요");
      if (!note?.trim()) return;
    }
    const { error } = await sb.rpc("review_budget_request", { p_id: r.id, p_approve: approve, p_note: note });
    if (error) return setMsg({ ok: false, text: dbError(error) });
    setMsg({ ok: true, text: `${r.department?.name ?? ""} ${won(Number(r.amount))}원을 ${approve ? "승인" : "반려"}했어요.` });
    q.reload();
  };

  const excel = () => downloadXlsx(fileName(`예산신청_${year}`, "xlsx"), [{
    name: `${year}년 예산신청`, widths: [12, 16, 14, 36, 10, 11, 8, 20],
    rows: [["부서", "항목", "금액", "사유", "신청자", "신청일", "상태", "검토 메모"],
      ...rows.map((r) => [r.department?.name, r.expense_item?.name ?? "(부서 전체)", Number(r.amount), r.reason, r.requester_name, r.requested_at.slice(0, 10), STATUS[r.status][0], r.review_note])],
  }]);

  return (
    <>
      <PageHeader actions={<ExcelButton onClick={excel} disabled={!rows.length} />} />
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      {q.error && <Notice kind="error">{q.error}</Notice>}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <YearSelect value={year} onChange={setYear} to={thisYear() + 1} />
        <select value={tab} onChange={(e) => setTab(e.target.value as RequestStatus | "")} className={input}>
          <option value="">전체 상태</option>
          {(["requested", "approved", "rejected"] as const).map((s) => <option key={s} value={s}>{STATUS[s][0]}</option>)}
        </select>
        <span className="ml-auto text-label">신청 {won(sum())}원 · 승인 {won(sum("approved"))}원 · 검토 중 {won(sum("requested"))}원</span>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="px-3 py-2 text-left">부서</th><th className="text-left">항목</th><th className="text-right">금액</th><th className="text-left">사유</th>
              <th>신청자</th><th>신청일</th><th>상태</th><th className="w-32" /></tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={8} className="py-8 text-center text-muted">{q.loading ? "불러오는 중…" : `${year}년 예산 신청이 없어요`}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-3 py-2 text-heading">{r.department?.name}</td>
                <td className="text-label">{r.expense_item?.name ?? <span className="text-muted">부서 전체</span>}</td>
                <td className="text-right font-medium text-heading">{won(Number(r.amount))}</td>
                <td className="max-w-72 whitespace-pre-wrap text-label">{r.reason}</td>
                <td className="text-center text-label">{r.requester_name ?? "-"}</td>
                <td className="text-center text-xs text-label">{r.requested_at.slice(0, 10)}</td>
                <td className="text-center">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                  {r.review_note && <div className="mt-0.5 text-xs text-muted">{r.review_note}</div>}
                </td>
                <td className="px-2 text-right text-xs">
                  {r.status === "requested" && <>
                    <button onClick={() => review(r, true)} className="rounded bg-primary px-3 py-1 text-white">승인</button>{" "}
                    <button onClick={() => review(r, false)} className={`${btn} py-1 text-danger`}>반려</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">승인한 신청은 결산·예산 &gt; 내년도 예산 화면에서 참고해요.</p>
    </>
  );
}
