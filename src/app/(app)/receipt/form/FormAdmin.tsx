"use client";
// 양식관리: 영수증 양식 목록(이름·버전·사용 여부·메모). 출력 서식은 별지 제45호의2서식(개정 2021. 3. 16.) HTML 재현본
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { loadChurch } from "@/lib/receipt/api";
import { supabaseBrowser } from "@/lib/supabase/client";
import ReceiptPaper from "../_parts/ReceiptPaper";

type F = { id: number; name: string; version: string | null; active: boolean | null; is_default: boolean; memo: string | null };

// 견본: 가상 값
const SAMPLE = {
  serial_no: "2025-PN001-0115", donor_kind: "PN", donor_name: "가나다", donor_rrn: "900101-1******", donor_brn: null,
  donor_address: "서울시 가상구 가상로 1", donation_year: 2025, year: 2025, issued_amount: 1200000, issued_at: "2026-01-15",
  detail: { types: { 십일조: 1200000 }, months: { "01": 100000, "02": 100000, "03": 1000000 } },
};

export default function FormAdmin() {
  return <DbOnly what="양식관리"><Admin /></DbOnly>;
}

function Admin() {
  const sb = supabaseBrowser();
  const q = useDbQuery(async (s) => ({
    forms: must(await s.from("receipt_form").select("id, name, version, active, is_default, memo").order("id")) as F[],
    church: await loadChurch(s),
  }), []);
  const [draft, setDraft] = useState({ name: "", version: "", memo: "" });
  const [edit, setEdit] = useState<F | null>(null);
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setMsg(null);
    const { error } = await fn();
    if (error) return setMsg({ ok: false, text: dbError(error) });
    setMsg({ ok: true, text: ok }); q.reload();
  };
  const add = () => sb && draft.name.trim() && run(async () => {
    const r = await sb.from("receipt_form").insert({ name: draft.name.trim(), version: draft.version.trim() || null, memo: draft.memo.trim() || null, active: true });
    if (!r.error) setDraft({ name: "", version: "", memo: "" });
    return r;
  }, "양식을 추가했어요.");
  const saveEdit = () => sb && edit && run(async () => {
    const r = await sb.from("receipt_form").update({ name: edit.name, version: edit.version, memo: edit.memo }).eq("id", edit.id);
    if (!r.error) setEdit(null);
    return r;
  }, "고쳤어요.");
  const makeDefault = (f: F) => sb && run(async () => {
    const off = await sb.from("receipt_form").update({ is_default: false }).eq("is_default", true);
    if (off.error) return off;
    return sb.from("receipt_form").update({ is_default: true, active: true }).eq("id", f.id);
  }, `${f.name}을(를) 기본 양식으로 정했어요.`);

  if (preview) return (
    <>
      <div className="no-print"><PageHeader actions={<><button onClick={() => setPreview(false)} className={btn}>← 목록</button><button onClick={() => window.print()} className={btnPrimary}>출력·PDF</button></>} /></div>
      <div className="overflow-x-auto"><ReceiptPaper r={SAMPLE} church={q.data?.church ?? null} sample /></div>
    </>
  );

  return (
    <>
      <PageHeader actions={<button onClick={() => setPreview(true)} className={btnPrimary}>기본 서식 미리보기</button>} />
      <Notice kind="ok">출력 서식은 소득세법 시행규칙 [별지 제45호의2서식] &lt;개정 2021. 3. 16.&gt; 앞쪽을 그대로 재현한 화면 서식이에요. 서식이 개정되면 여기 메모로 남겨 주세요.</Notice>
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      <div className={`${card} mb-4 overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="px-3 py-2 text-left">이름</th><th>버전</th><th className="text-left">메모</th><th>사용</th><th>기본</th><th className="w-32" /></tr>
          </thead>
          <tbody>
            {(q.data?.forms ?? []).map((f) => edit?.id === f.id ? (
              <tr key={f.id} className="border-t">
                <td className="px-3 py-1.5"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={`${input} w-full`} /></td>
                <td><input value={edit.version ?? ""} onChange={(e) => setEdit({ ...edit, version: e.target.value })} className={`${input} w-24`} /></td>
                <td><input value={edit.memo ?? ""} onChange={(e) => setEdit({ ...edit, memo: e.target.value })} className={`${input} w-full`} /></td>
                <td /><td />
                <td className="px-2 text-right text-xs"><button onClick={saveEdit} className="text-primary">저장</button> · <button onClick={() => setEdit(null)}>취소</button></td>
              </tr>
            ) : (
              <tr key={f.id} className="border-t">
                <td className="px-3 py-1.5 text-heading">{f.name}</td>
                <td className="text-center text-xs">{f.version}</td>
                <td className="text-xs text-label">{f.memo}</td>
                <td className="text-center">
                  <input type="checkbox" checked={!!f.active} disabled={f.is_default} aria-label="사용"
                    onChange={(e) => sb && run(async () => sb.from("receipt_form").update({ active: e.target.checked }).eq("id", f.id), "바꿨어요.")} />
                </td>
                <td className="text-center text-xs">{f.is_default ? <span className="rounded bg-success-subtle px-2 py-0.5 text-success">기본</span> : <button onClick={() => makeDefault(f)} className="text-primary">기본으로</button>}</td>
                <td className="px-2 text-right text-xs"><button onClick={() => setEdit(f)} className="text-primary">수정</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`${card} grid gap-3 p-4 md:grid-cols-[1fr_120px_2fr_auto]`}>
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="양식 이름" className={input} />
        <input value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} placeholder="버전" className={input} />
        <input value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} placeholder="메모(개정일, 파일 위치 등)" className={input} />
        <button onClick={add} disabled={!draft.name.trim()} className={btnPrimary}>양식 추가</button>
      </div>
      <p className="mt-3 text-xs text-muted">영수증은 발행 당시의 기본 양식으로 기록돼요. 출력 모양은 지금은 HTML 서식 하나예요.</p>
    </>
  );
}
