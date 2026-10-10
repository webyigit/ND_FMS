"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { supabaseBrowser } from "@/lib/supabase/client";
import { FUND_LABEL, UNITS, flattenTree, moveType, type OtRow } from "@/lib/settings/offeringTypes";

type Fund = { id: number; name: string; kind: string };
type Form = { id: number | null; name: string; fund_id: string; parent_id: string; amount_unit: number; total_only: boolean; has_memo: boolean };
const blank: Form = { id: null, name: "", fund_id: "", parent_id: "", amount_unit: 1000, total_only: false, has_memo: false };
const COLS = "id, name, fund_id, parent_id, total_only, amount_unit, has_memo, sort_order, active";

// 설정 > 헌금구분: 추가/수정/비활성/순서, 기금·상위 구분·입력 단위·총액만·내용칸
export default function OfferingTypeAdmin() {
  const sb = supabaseBrowser()!;
  const q = useDbQuery(async (sb) => {
    const [t, f] = await Promise.all([sb.from("offering_type").select(COLS).order("sort_order"), sb.from("fund").select("id, name, kind").order("id")]);
    return { types: must(t) as OtRow[], funds: must(f) as Fund[] };
  }, []);
  const [form, setForm] = useState<Form>(blank);
  const [showOff, setShowOff] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const types = useMemo(() => q.data?.types ?? [], [q.data]);
  const funds = q.data?.funds ?? [];
  const fundName = (id: number | null) => { const f = funds.find((x) => x.id === id); return f ? FUND_LABEL[f.kind] ?? f.name : "-"; };
  const tree = flattenTree(types).filter((t) => showOff || t.active !== false);
  const parents = types.filter((t) => t.parent_id == null && t.id !== form.id && t.active !== false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const act = async (fn: () => Promise<string | void>) => {
    setBusy(true); setNote(null);
    try { const text = await fn(); if (text) setNote({ ok: true, text }); q.reload(); }
    catch (e) { setNote({ ok: false, text: dbError(e) }); }
    finally { setBusy(false); }
  };
  // 상위 > 하위 순서로 1부터 다시 매긴다
  const renumber = async (ids: number[]) => must(await sb.rpc("reorder_offering_types", { p_ids: ids }));

  const save = () => act(async () => {
    if (!form.name.trim()) return;
    const row = {
      name: form.name.trim(), fund_id: form.fund_id ? Number(form.fund_id) : null, parent_id: form.parent_id ? Number(form.parent_id) : null,
      amount_unit: form.amount_unit, total_only: form.total_only, has_memo: form.has_memo,
    };
    if (form.id) must(await sb.from("offering_type").update(row).eq("id", form.id).select("id"));
    else {
      const max = Math.max(0, ...types.map((t) => t.sort_order ?? 0));
      const [made] = must(await sb.from("offering_type").insert({ ...row, sort_order: max + 1, active: true }).select(COLS)) as OtRow[];
      await renumber(flattenTree([...types, made]).map((t) => t.id));
    }
    if (form.id) await renumber(flattenTree(types.map((t) => (t.id === form.id ? { ...t, ...row } : t))).map((t) => t.id));
    setForm(blank);
    return `'${row.name}' 헌금구분을 저장했어요. 다른 화면은 새로고침하면 반영돼요.`;
  });
  const move = (id: number, dir: -1 | 1) => { const ids = moveType(types, id, dir); if (ids) act(async () => { await renumber(ids); }); };
  const remove = (t: OtRow) => confirm(`'${t.name}'을(를) 삭제할까요? 이미 수입·예산에 쓰였으면 비활성으로 바뀌어요.`) && act(async () => {
    const r = must(await sb.rpc("remove_offering_type", { p_id: t.id }));
    return r === "deleted" ? `'${t.name}'을(를) 삭제했어요.` : `'${t.name}'은(는) 이미 쓰인 구분이라 비활성으로 바꿨어요.`;
  });
  const reactivate = (t: OtRow) => act(async () => { must(await sb.from("offering_type").update({ active: true }).eq("id", t.id).select("id")); return `'${t.name}'을(를) 다시 사용해요.`; });
  const edit = (t: OtRow) => setForm({
    id: t.id, name: t.name, fund_id: t.fund_id ? String(t.fund_id) : "", parent_id: t.parent_id ? String(t.parent_id) : "",
    amount_unit: t.amount_unit ?? 1, total_only: !!t.total_only, has_memo: !!t.has_memo,
  });

  return (
    <>
      <PageHeader actions={<label className="flex items-center gap-1 text-sm text-label"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> 비활성도 보기</label>} />
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      {note && <Notice kind={note.ok ? "ok" : "error"}>{note.text}</Notice>}

      <div className={`${card} mb-4 p-4 text-sm`}>
        <div className="grid gap-3 md:grid-cols-[1fr_120px_160px_130px_auto]">
          <label className="text-xs text-label">이름 *
            <input value={form.name} onChange={(e) => set("name", e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} className={`${input} mt-1 w-full`} />
          </label>
          <label className="text-xs text-label">기금
            <select value={form.fund_id} onChange={(e) => set("fund_id", e.target.value)} className={`${input} mt-1 w-full`}>
              <option value="">선택</option>
              {funds.map((f) => <option key={f.id} value={f.id}>{FUND_LABEL[f.kind] ?? f.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-label">상위 구분
            <select value={form.parent_id} onChange={(e) => set("parent_id", e.target.value)} disabled={!!form.id && types.some((t) => t.parent_id === form.id)} className={`${input} mt-1 w-full`}>
              <option value="">없음(최상위)</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-label">입력 단위
            <select value={form.amount_unit} onChange={(e) => set("amount_unit", Number(e.target.value))} className={`${input} mt-1 w-full`}>
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button onClick={save} disabled={busy || !form.name.trim()} className={btnPrimary}>{form.id ? "수정" : "추가"}</button>
            {form.id && <button onClick={() => setForm(blank)} className={btn}>취소</button>}
          </div>
        </div>
        <div className="mt-2 flex gap-4">
          <label className="flex items-center gap-1"><input type="checkbox" checked={form.total_only} onChange={(e) => set("total_only", e.target.checked)} /> 총액만 입력(주일헌금처럼 이름 없이)</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={form.has_memo} onChange={(e) => set("has_memo", e.target.checked)} /> 내용칸(기타감사 등)</label>
        </div>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="w-20 px-3 py-2">순서</th><th className="text-left">이름</th><th>기금</th><th>입력 단위</th><th>총액만</th><th>내용칸</th><th>상태</th><th className="w-40" /></tr>
          </thead>
          <tbody>
            {tree.map((t) => (
              <tr key={t.id} className={`border-t ${t.active === false ? "text-muted" : ""} ${form.id === t.id ? "bg-primary-subtle" : ""}`}>
                <td className="px-3 py-1.5 text-center text-xs">
                  <button disabled={busy} onClick={() => move(t.id, -1)} className="px-1 text-label" aria-label="위로">▲</button>
                  <button disabled={busy} onClick={() => move(t.id, 1)} className="px-1 text-label" aria-label="아래로">▼</button>
                </td>
                <td className={t.depth ? "pl-6" : "font-medium text-heading"}>{t.depth ? "ㄴ " : ""}{t.name}</td>
                <td className="text-center">{fundName(t.fund_id)}</td>
                <td className="text-center">{UNITS.find((u) => u.value === t.amount_unit)?.label ?? t.amount_unit}</td>
                <td className="text-center">{t.total_only ? "O" : ""}</td>
                <td className="text-center">{t.has_memo ? "O" : ""}</td>
                <td className="text-center">{t.active === false ? <span className="rounded bg-danger-subtle px-1 text-xs text-danger">비활성</span> : <span className="text-xs text-success">사용</span>}</td>
                <td className="px-3 text-right text-xs">
                  <button onClick={() => edit(t)} className="text-primary">수정</button>{" "}
                  {t.active === false
                    ? <button onClick={() => reactivate(t)} className="text-primary">다시 사용</button>
                    : <button onClick={() => remove(t)} className="text-danger">삭제</button>}
                </td>
              </tr>
            ))}
            {!q.loading && !tree.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">헌금구분이 없어요. supabase/seed.sql 을 실행하거나 위에서 추가해 주세요.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">이미 수입·예산에 쓰인 구분은 지우지 않고 비활성으로 바꿔요. 비활성 구분은 수입입력에 나오지 않아요.</p>
    </>
  );
}
