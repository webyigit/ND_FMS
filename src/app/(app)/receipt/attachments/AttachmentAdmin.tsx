"use client";
// 첨부양식 관리: 기부금영수증과 함께 출력·제출하는 양식 파일 올리기·목록·내려받기·삭제
import { useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import { btnPrimary, card, input } from "@/components/ui/Buttons";
import { useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { ACCEPT, addAttachment, checkFile, loadAttachments, missingHint, openAttachment, removeAttachment, sizeText, type Attachment } from "@/lib/receipt/attachments";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function AttachmentAdmin() {
  return <DbOnly what="첨부양식 관리"><Admin /></DbOnly>;
}

function Admin() {
  const sb = supabaseBrowser();
  const q = useDbQuery((s) => loadAttachments(s), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState({ name: "", memo: "" });
  const [edit, setEdit] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null); setBusy(true);
    try { await fn(); setMsg({ ok: true, text: ok }); q.reload(); }
    catch (e) { setMsg({ ok: false, text: missingHint(dbError(e)) }); }
    finally { setBusy(false); }
  };
  const pick = (f: File | null) => {
    setMsg(null);
    const bad = f && checkFile(f);
    if (bad) { setMsg({ ok: false, text: bad }); setFile(null); if (fileRef.current) fileRef.current.value = ""; return; }
    setFile(f);
    if (f && !draft.name.trim()) setDraft((d) => ({ ...d, name: f.name.replace(/\.[^.]+$/, "") }));
  };
  const upload = () => sb && file && run(async () => {
    await addAttachment(sb, file, draft.name, draft.memo);
    setFile(null); setDraft({ name: "", memo: "" });
    if (fileRef.current) fileRef.current.value = "";
  }, "올렸어요.");
  const open = (a: Attachment, download: boolean) => sb && run(() => openAttachment(sb, a, download), download ? "내려받기를 시작했어요." : "새 창에서 열었어요.");
  const update = (a: Attachment, patch: Partial<Attachment>, ok: string) => sb && run(async () => {
    const r = await sb.from("receipt_attachment").update(patch).eq("id", a.id);
    if (r.error) throw r.error;
  }, ok);
  const remove = (a: Attachment) => sb && confirm(`'${a.name}' 양식을 지울까요? 파일도 함께 지워져요.`) && run(() => removeAttachment(sb, a), "지웠어요.");

  const rows = q.data ?? [];
  return (
    <>
      <PageHeader />
      <Notice kind="ok">영수증과 함께 출력·제출할 양식을 올려 두면 영수증 출력 화면에서 바로 열 수 있어요. 그림(JPG·PNG)은 영수증 뒤에 붙여 함께 출력돼요. 파일당 50MB까지.</Notice>
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      {q.error && <Notice kind="error">불러오지 못했어요: {missingHint(q.error)}</Notice>}

      <div className={`${card} mb-4 overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="px-3 py-2 text-left">양식 이름</th><th className="text-left">파일</th><th>크기</th><th className="text-left">메모</th><th>출력 화면</th><th className="w-48" /></tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">{q.loading ? "불러오는 중…" : "올린 양식이 없어요."}</td></tr>}
            {rows.map((a) => edit?.id === a.id ? (
              <tr key={a.id} className="border-t">
                <td className="px-3 py-1.5"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={`${input} w-full`} aria-label="양식 이름" /></td>
                <td className="text-xs text-label">{a.file_name}</td><td />
                <td><input value={edit.memo ?? ""} onChange={(e) => setEdit({ ...edit, memo: e.target.value })} className={`${input} w-full`} aria-label="메모" /></td>
                <td />
                <td className="px-2 text-right text-xs">
                  <button disabled={busy || !edit.name.trim()} onClick={() => { update(a, { name: edit.name.trim(), memo: edit.memo?.trim() || null }, "고쳤어요."); setEdit(null); }} className="text-primary disabled:opacity-50">저장</button>
                  {" · "}<button onClick={() => setEdit(null)}>취소</button>
                </td>
              </tr>
            ) : (
              <tr key={a.id} className="border-t">
                <td className="px-3 py-1.5 text-heading">{a.name}</td>
                <td className="max-w-[220px] truncate text-xs text-label" title={a.file_name}>{a.file_name}</td>
                <td className="text-center text-xs">{sizeText(a.size_bytes)}</td>
                <td className="text-xs text-label">{a.memo}</td>
                <td className="text-center">
                  <input type="checkbox" checked={a.active} disabled={busy} aria-label="출력 화면에 보이기"
                    onChange={(e) => update(a, { active: e.target.checked }, e.target.checked ? "출력 화면에 보여요." : "출력 화면에서 숨겼어요.")} />
                </td>
                <td className="whitespace-nowrap px-2 text-right text-xs">
                  <button disabled={busy} onClick={() => open(a, false)} className="text-primary">열기</button>
                  {" · "}<button disabled={busy} onClick={() => open(a, true)} className="text-primary">내려받기</button>
                  {" · "}<button disabled={busy} onClick={() => setEdit(a)} className="text-primary">수정</button>
                  {" · "}<button disabled={busy} onClick={() => remove(a)} className="text-danger">삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`${card} grid gap-3 p-4 md:grid-cols-[2fr_1fr_2fr_auto]`}>
        <input ref={fileRef} type="file" accept={ACCEPT} onChange={(e) => pick(e.target.files?.[0] ?? null)} className="min-w-0 text-sm" aria-label="양식 파일" />
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="양식 이름" className={input} />
        <input value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} placeholder="메모(용도, 제출처 등)" className={input} />
        <button onClick={upload} disabled={!file || busy} className={`${btnPrimary} whitespace-nowrap`}>{busy ? "처리 중…" : "올리기"}</button>
      </div>
      <p className="mt-3 text-xs text-muted">JPG·PNG·PDF·엑셀·PPT·워드·한글 파일을 올릴 수 있어요. 엑셀·PPT 등은 출력 화면에서 내려받아 출력해요.</p>
    </>
  );
}
