"use client";
import { Fragment, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { supabaseBrowser } from "@/lib/supabase/client";
import { won } from "@/lib/format";
import { emptyFixed, fixedProblems, groupFixedByWeek, toFixedRow, type FixedForm } from "@/lib/expense/fixed";

type Item = { id: number; name: string; sort_order: number | null; department: { name: string; sort_order: number | null } | null };
type Payee = { id: number; name: string | null; holder: string | null; bank: string | null };
type Row = FixedForm & { id: number };
type DbRow = { id: number; week_of_month: number; content: string | null; amount: number | null; expense_item_id: number | null; payee_id: number | null; memo: string | null; active: boolean | null };

export default function FixedExpenses() {
  return <DbOnly what="고정지출관리"><Screen /></DbOnly>;
}

function Screen() {
  const sb = supabaseBrowser()!;
  const q = useDbQuery(async (sb) => {
    const [rows, items, payees] = await Promise.all([
      sb.from("fixed_expense").select("id, week_of_month, content, amount, expense_item_id, payee_id, memo, active"),
      sb.from("expense_item").select("id, name, sort_order, department(name, sort_order)"),
      sb.from("payee").select("id, name, holder, bank").order("name"),
    ]);
    return {
      rows: must(rows as { data: DbRow[] | null; error: { message: string } | null }).map((r): Row => ({
        id: r.id, weekOfMonth: r.week_of_month, content: r.content ?? "", amount: Number(r.amount ?? 0), expenseItemId: r.expense_item_id,
        payeeId: r.payee_id, memo: r.memo ?? "", active: r.active ?? true,
      })),
      items: (must(items) as unknown as Item[]).sort((a, b) => (a.department?.sort_order ?? 0) - (b.department?.sort_order ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      payees: must(payees) as Payee[],
    };
  }, []);
  const [edit, setEdit] = useState<{ id: number | null; f: FixedForm } | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [week, setWeek] = useState(0);

  const itemLabel = useMemo(() => new Map((q.data?.items ?? []).map((i) => [i.id, `${i.department?.name ?? ""} · ${i.name}`])), [q.data]);
  const payeeLabel = useMemo(() => new Map((q.data?.payees ?? []).map((p) => [p.id, [p.name ?? p.holder, p.bank].filter(Boolean).join(" · ")])), [q.data]);
  const groups = useMemo(() => groupFixedByWeek((q.data?.rows ?? []).filter((r) => !week || r.weekOfMonth === week)), [q.data, week]);
  const totals = useMemo(() => [1, 2, 3, 4, 5].map((w) => (q.data?.rows ?? []).filter((r) => r.active && r.weekOfMonth === w).reduce((s, r) => s + r.amount, 0)), [q.data]);

  const save = async () => {
    if (!edit) return;
    const problems = fixedProblems(edit.f);
    if (problems.length) return setErr(`채워 주세요: ${problems.join(", ")}`);
    setBusy(true); setErr(""); setMsg("");
    const body = toFixedRow(edit.f);
    const r = edit.id ? await sb.from("fixed_expense").update(body).eq("id", edit.id).select("id") : await sb.from("fixed_expense").insert(body).select("id");
    setBusy(false);
    if (r.error) return setErr(`저장하지 못했어요: ${dbError(r.error)}`);
    if (!r.data?.length) return setErr("저장 권한이 없어요.");
    setMsg(edit.id ? "고쳤어요." : "추가했어요."); setEdit(null); q.reload();
  };
  // 사용 ↔ 미사용 바로 바꾸기(미사용은 '고정지출 불러오기'에서 빠짐)
  const toggle = async (r: Row) => {
    setErr(""); setMsg(""); setBusy(true);
    const { data, error } = await sb.from("fixed_expense").update({ active: !r.active }).eq("id", r.id).select("id");
    setBusy(false);
    if (error) return setErr(`바꾸지 못했어요: ${dbError(error)}`);
    if (!data?.length) return setErr("바꿀 권한이 없어요.");
    setMsg(`'${r.content}'을(를) ${r.active ? "미사용으로 바꿨어요. 고정지출 불러오기에서 빠져요." : "다시 사용해요."}`); q.reload();
  };
  const remove = async (r: Row) => {
    if (!confirm(`'${r.content}' 고정지출을 지울까요?`)) return;
    setErr(""); setMsg("");
    const { error } = await sb.from("fixed_expense").delete().eq("id", r.id);
    if (error) return setErr(`지우지 못했어요: ${dbError(error)}`);
    setMsg("지웠어요."); q.reload();
  };

  const line = (r: Row) => (
    <tr key={r.id} className={`border-t ${r.active ? "" : "text-muted"}`}>
      <td className="py-2 text-center">{r.weekOfMonth}째</td>
      <td className={r.active ? "text-heading" : "line-through"}>{r.content}</td>
      <td className="text-right">{won(r.amount)}</td>
      <td className="pl-4">{r.expenseItemId ? itemLabel.get(r.expenseItemId) : "-"}</td>
      <td>{r.payeeId ? payeeLabel.get(r.payeeId) : "-"}</td>
      <td className="text-label">{r.memo}</td>
      <td className="text-center">
        <button onClick={() => toggle(r)} disabled={busy} title={r.active ? "눌러서 미사용으로" : "눌러서 사용으로"} aria-pressed={r.active}
          className={`rounded-full border px-2.5 py-0.5 text-xs ${r.active ? "border-success bg-success-subtle text-success" : "bg-surface-2 text-muted"}`}>
          {r.active ? "사용" : "미사용"}
        </button>
      </td>
      <td className="px-2 text-right text-xs">
        <button onClick={() => { setEdit({ id: r.id, f: { ...r } }); setMsg(""); }} className="rounded border px-2 py-1">고치기</button>{" "}
        <button onClick={() => remove(r)} className="rounded border px-2 py-1 text-danger">삭제</button>
      </td>
    </tr>
  );

  const form = edit && (
    <div className={`${card} mb-4 p-4 text-sm`}>
      <div className="mb-3 font-semibold text-heading">{edit.id ? "고정지출 고치기" : "고정지출 추가"}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-label">N째 주
          <select className={`${input} mt-1 block w-full`} value={edit.f.weekOfMonth} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, weekOfMonth: Number(e.target.value) } })}>
            {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>{w}째 주</option>)}
          </select>
        </label>
        <label className="text-xs text-label lg:col-span-2">내용
          <input className={`${input} mt-1 block w-full`} value={edit.f.content} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, content: e.target.value } })} />
        </label>
        <label className="text-xs text-label">금액
          <input className={`${input} mt-1 block w-full text-right`} inputMode="numeric" value={edit.f.amount ? won(edit.f.amount) : ""}
            onChange={(e) => setEdit({ ...edit, f: { ...edit.f, amount: Number(e.target.value.replace(/\D/g, "")) } })} />
        </label>
        <label className="text-xs text-label lg:col-span-2">부서·항목
          <select className={`${input} mt-1 block w-full`} value={edit.f.expenseItemId ?? ""} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, expenseItemId: e.target.value ? Number(e.target.value) : null } })}>
            <option value="">선택</option>
            {q.data?.items.map((i) => <option key={i.id} value={i.id}>{itemLabel.get(i.id)}</option>)}
          </select>
        </label>
        <label className="text-xs text-label lg:col-span-2">송금처
          <select className={`${input} mt-1 block w-full`} value={edit.f.payeeId ?? ""} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, payeeId: e.target.value ? Number(e.target.value) : null } })}>
            <option value="">없음</option>
            {q.data?.payees.map((p) => <option key={p.id} value={p.id}>{payeeLabel.get(p.id)}</option>)}
          </select>
        </label>
        <label className="text-xs text-label lg:col-span-3">메모
          <input className={`${input} mt-1 block w-full`} value={edit.f.memo} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, memo: e.target.value } })} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={edit.f.active} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, active: e.target.checked } })} /> 사용 (끄면 미사용: 불러오기에서 빠짐)
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? "저장 중…" : "저장"}</button>
        <button onClick={() => { setEdit(null); setErr(""); }} className={btn}>취소</button>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader actions={<button onClick={() => { setEdit({ id: null, f: { ...emptyFixed(), weekOfMonth: week || 1 } }); setMsg(""); }} className={btnPrimary}>고정지출 추가</button>} />
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      {err && <Notice kind="error">{err}</Notice>}
      {msg && <Notice>{msg}</Notice>}
      {form}

      <div className={`${card} mb-4 flex flex-wrap items-center gap-2 p-3 text-sm`}>
        <div className="seg flex overflow-hidden rounded border">
          {[0, 1, 2, 3, 4, 5].map((w) => (
            <button key={w} onClick={() => setWeek(w)} className={`px-3 py-1.5 ${week === w ? "bg-primary text-white" : ""}`}>{w ? `${w}째 주` : "전체"}</button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted">사용 중 합계 {totals.map((t, i) => `${i + 1}주 ${won(t)}`).join(" · ")}</span>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="tbl-cards w-full text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="w-16 py-2">주</th><th className="text-left">내용</th><th className="w-28 text-right">금액</th><th className="pl-4 text-left">부서·항목</th><th className="text-left">송금처</th><th className="text-left">메모</th><th className="w-20">상태</th><th className="w-28" /></tr>
          </thead>
          <tbody>
            {q.loading && <tr><td colSpan={8} className="py-6 text-center text-muted">불러오는 중…</td></tr>}
            {!q.loading && !groups.length && <tr><td colSpan={8} className="py-6 text-center text-muted">등록된 고정지출이 없어요.</td></tr>}
            {groups.map((g) => (
              <Fragment key={g.week}>
                <tr className="border-t bg-surface-2/60"><td colSpan={8} className="px-3 py-1.5 text-xs font-semibold text-heading">{g.week}째 주 · 사용 중 {g.active.length}건 {won(g.total)}</td></tr>
                {!g.active.length && <tr><td colSpan={8} className="py-3 text-center text-xs text-muted">사용 중인 항목이 없어요.</td></tr>}
                {g.active.map((r) => line(r))}
                {g.inactive.length > 0 && <tr className="border-t border-dashed"><td colSpan={8} className="px-3 py-1.5 text-xs text-muted"><i className="fa-solid fa-ban mr-1" aria-hidden />{g.week}째 주 미사용 {g.inactive.length}건 · 고정지출 불러오기에서 빠져요</td></tr>}
                {g.inactive.map((r) => line(r))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">지출입력의 &apos;고정지출 불러오기&apos;는 그 주일이 몇째 주인지(날짜÷7 올림)에 맞는 사용 중 항목만 불러와요. 상태 칸의 사용/미사용을 누르면 바로 바뀌고, 미사용 항목은 불러오기에서 빠져요.</p>
    </>
  );
}
