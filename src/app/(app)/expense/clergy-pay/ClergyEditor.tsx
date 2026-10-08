"use client";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import Notice from "@/components/ui/Notice";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { must } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { CLERGY_TITLES } from "@/lib/demo";

export type Clergy = { id: number; name: string; title: string; expense_item_id: number; keyword: string | null; sort_order: number };
export type Item = { id: number; name: string; dept: string };

// 교역자 추가하기: 이름·직분·급여가 나가는 지출 항목(+내용에 들어간 말)을 등록한다
export default function ClergyEditor({ sb, clergy, items, onChange, onClose }: {
  sb: SupabaseClient; clergy: Clergy[]; items: Item[]; onChange: () => void; onClose: () => void;
}) {
  const [f, setF] = useState({ name: "", title: "전도사", itemId: 0, keyword: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const itemName = (id: number) => items.find((i) => i.id === id)?.name ?? "";

  const add = async () => {
    if (!f.name.trim() || !f.title.trim() || !f.itemId) return setErr("이름·직분·지출 항목을 넣어 주세요");
    setBusy(true); setErr(null);
    try {
      must(await sb.from("clergy").insert({
        name: f.name.trim(), title: f.title.trim(), expense_item_id: f.itemId,
        keyword: f.keyword.trim() || null, sort_order: Math.max(0, ...clergy.map((c) => c.sort_order)) + 1,
      }));
      setF({ name: "", title: f.title, itemId: 0, keyword: "" });
      onChange();
    } catch (e) { setErr(dbError(e)); } finally { setBusy(false); }
  };
  const remove = async (c: Clergy) => {
    if (!confirm(`${c.name} (${itemName(c.expense_item_id)})을(를) 목록에서 뺄까요? 지출 기록은 그대로 남아요.`)) return;
    try { must(await sb.from("clergy").delete().eq("id", c.id)); onChange(); } catch (e) { setErr(dbError(e)); }
  };

  return (
    <div className={`no-print mb-4 p-4 text-sm ${card}`}>
      <div className="mb-3 flex items-center justify-between">
        <b className="text-heading">교역자 추가하기</b>
        <button onClick={onClose} className="text-muted">닫기</button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">이름<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="이름 또는 자리" className={input} /></label>
        <label className="flex flex-col gap-1">직분
          <input list="clergy-titles" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={`${input} w-28`} />
          <datalist id="clergy-titles">{CLERGY_TITLES.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label className="flex flex-col gap-1">지출 항목
          <select value={f.itemId} onChange={(e) => setF({ ...f, itemId: Number(e.target.value) })} className={input}>
            <option value={0}>선택</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.dept} · {i.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">내용에 들어간 말(선택)<input value={f.keyword} onChange={(e) => setF({ ...f, keyword: e.target.value })} placeholder="예: 이름" className={input} /></label>
        <button onClick={add} disabled={busy} className={btnPrimary}>추가</button>
      </div>
      <p className="mt-2 text-xs text-muted">그 지출 항목의 지출 중 내용에 이 말이 든 것만 모아요. 비우면 그 항목 지출 전부예요. 같은 이름으로 항목을 더 추가하면 한 사람으로 합쳐 보여요.</p>
      {err && <div className="mt-2"><Notice kind="error">{err}</Notice></div>}
      {clergy.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="px-3 py-1.5 text-left">직분</th><th className="px-3 text-left">이름</th><th className="px-3 text-left">지출 항목</th><th className="px-3 text-left">내용에 들어간 말</th><th /></tr>
          </thead>
          <tbody>
            {clergy.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-1.5 text-label">{c.title}</td><td className="px-3">{c.name}</td>
                <td className="px-3">{itemName(c.expense_item_id)}</td><td className="px-3">{c.keyword || "(전부)"}</td>
                <td className="px-3 text-right"><button onClick={() => remove(c)} className={`${btn} py-0.5 text-xs`}>빼기</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
