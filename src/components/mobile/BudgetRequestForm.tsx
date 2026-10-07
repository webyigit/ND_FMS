"use client";
import { useState } from "react";
import MobileShell, { DemoOnly, mButton, mCard, mInput } from "./MobileShell";
import YearSelect from "@/components/ui/YearSelect";
import { useDbQuery, must } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useDeptItems } from "@/lib/work/me";
import { STATUS, editable, type RequestStatus } from "@/lib/work/requests";
import { thisYear, toAmount, won } from "@/lib/format";

type Req = { id: number; year: number; amount: number; reason: string | null; status: RequestStatus; review_note: string | null; requested_at: string;
  department: { name: string } | null; expense_item: { name: string } | null };

// 예산 신청: 연도·부서·항목·금액·사유. 내년도 예산 편성 때 재정부가 참고한다.
export default function BudgetRequestForm() {
  const sb = supabaseBrowser();
  const items = useDeptItems();
  const [year, setYear] = useState(thisYear() + 1);
  const [deptId, setDeptId] = useState<number | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = useDbQuery(async (s) => {
    const { data: u } = await s.auth.getUser();
    return must(await s.from("budget_request").select("id, year, amount, reason, status, review_note, requested_at, department(name), expense_item(name)")
      .eq("requested_by", u.user?.id ?? "").order("requested_at", { ascending: false })) as unknown as Req[];
  }, []);

  if (!sb) return <MobileShell title="예산 신청" nav="dept"><DemoOnly what="예산 신청" /></MobileShell>;
  const depts = items.data ?? [];
  const dept = depts.find((d) => d.id === deptId) ?? (depts.length === 1 ? depts[0] : undefined);

  const submit = async () => {
    const n = toAmount(amount);
    if (!dept) return setMsg({ ok: false, text: "부서를 골라 주세요" });
    if (!(n > 0)) return setMsg({ ok: false, text: "금액을 입력해 주세요" });
    setBusy(true); setMsg(null);
    const { error } = await sb.from("budget_request").insert({ year, department_id: dept.id, expense_item_id: itemId, amount: n, reason: reason.trim() || null });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: `신청하지 못했어요: ${dbError(error)}` });
    setMsg({ ok: true, text: `${year}년 예산 ${won(n)}원을 신청했어요.` });
    setAmount(""); setReason(""); setItemId(null);
    mine.reload();
  };
  const del = async (r: Req) => {
    if (!confirm("이 신청을 지울까요?")) return;
    const { error } = await sb.from("budget_request").delete().eq("id", r.id);
    if (error) setMsg({ ok: false, text: dbError(error) }); else mine.reload();
  };

  return (
    <MobileShell title="예산 신청" nav="dept" account>
      <div className={`${mCard} mb-4 space-y-3 text-sm`}>
        <label className="block text-xs text-label">연도<div className="mt-1"><YearSelect value={year} onChange={setYear} from={thisYear()} to={thisYear() + 1} /></div></label>
        {depts.length !== 1 && (
          <label className="block text-xs text-label">부서
            <select value={dept?.id ?? ""} onChange={(e) => { setDeptId(Number(e.target.value) || null); setItemId(null); }} className={mInput}>
              <option value="">부서 선택</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
        {depts.length === 1 && <div className="text-xs text-label">부서 <b className="ml-1 text-sm text-heading">{dept?.name}</b></div>}
        <label className="block text-xs text-label">항목
          <select value={itemId ?? ""} onChange={(e) => setItemId(Number(e.target.value) || null)} disabled={!dept} className={mInput}>
            <option value="">부서 전체(항목 미지정)</option>
            {dept?.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <label className="block text-xs text-label">금액(원)
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value ? won(toAmount(e.target.value)) : "")} placeholder="0" className={mInput} />
        </label>
        <label className="block text-xs text-label">사유
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="필요한 이유, 사용 계획" className={mInput} />
        </label>
        {msg && <div className={`rounded px-3 py-2 ${msg.ok ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>{msg.text}</div>}
        <button onClick={submit} disabled={busy} className={mButton}>{busy ? "신청 중…" : "예산 신청"}</button>
      </div>

      <div className="mb-2 text-sm font-semibold text-heading">내 예산 신청</div>
      {mine.error && <div className="mb-3 rounded bg-danger-subtle px-3 py-2 text-sm text-danger">{mine.error}</div>}
      <ul className="divide-y divide-line rounded-lg bg-surface text-sm shadow-card">
        {!mine.data?.length && <li className="px-4 py-6 text-center text-muted">{mine.loading ? "불러오는 중…" : "신청한 예산이 없어요"}</li>}
        {mine.data?.map((r) => (
          <li key={r.id} className="px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
              <span className="flex-1 text-heading">{r.year}년 {r.department?.name}{r.expense_item ? ` · ${r.expense_item.name}` : ""}</span>
              <span className="font-semibold text-heading">{won(Number(r.amount))}</span>
            </div>
            {r.reason && <div className="mt-1 text-xs text-label">{r.reason}</div>}
            {r.review_note && <div className="mt-1 text-xs text-danger">재정부: {r.review_note}</div>}
            {editable(r.status) && <button onClick={() => del(r)} className="mt-1 text-xs text-danger">삭제</button>}
          </li>
        ))}
      </ul>
    </MobileShell>
  );
}
