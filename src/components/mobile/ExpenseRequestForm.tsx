"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faXmark } from "@fortawesome/free-solid-svg-icons";
import { mButton, mCard, mInput } from "./MobileShell";
import { useDbQuery, must } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useDeptItems, useMe } from "@/lib/work/me";
import { editable, expenseFormProblems, type ExpenseForm } from "@/lib/work/requests";
import { localDate, toAmount, won } from "@/lib/format";

type Saved = { id: number; bank: string | null; holder: string | null; account: string } | null;
type Editing = { id: number; status: string; department_id: number | null; content: string; amount: number; used_at: string | null; payee_id: number | null; drive_file_id: string | null };

/** 사진은 긴 변 2000px JPEG로 줄여 올린다. 브라우저가 못 여는 형식(HEIC 등)은 원본 그대로 */
async function shrink(f: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f);
    const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < f.size ? blob : f;
  } catch { return f; }
}

// 지출 신청(부서장 /m/expense/new, 지출신청하기 /request 공용). ?id= 이면 승인 전 신청 수정.
// 부서장은 자기 부서를 고르고, 목회자는 부서 없이 신청한다(부서·항목은 재정부가 검토 때 지정).
export default function ExpenseRequestForm({ listHref, onSaved }: { listHref: string; onSaved?: () => void }) {
  const sb = supabaseBrowser()!;
  const me = useMe();
  const depts = useDeptItems();
  const [editId] = useState(() => Number(new URLSearchParams(location.search).get("id")) || null);
  const blank: ExpenseForm = { departmentId: null, content: "", amount: 0, usedAt: localDate(), bank: "", accountNo: "", holder: "" };
  const [f, setF] = useState<ExpenseForm>(blank);
  const [amountText, setAmountText] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; name: string } | null>(null);
  const [newAccount, setNewAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const editing = useDbQuery(async (s) => (editId
    ? (must(await s.from("v_expense_request").select("id, status, department_id, content, amount, used_at, payee_id, drive_file_id").eq("id", editId).maybeSingle()) as Editing | null)
    : null), [editId]);
  const saved = useDbQuery(async (s) => ((must(await s.rpc("my_payee", { p_payee_id: editing.data?.payee_id ?? null })) as Saved[])[0] ?? null), [editing.data?.payee_id]);

  // 수정: 기존 값 채우기
  const e0 = editing.data;
  useEffect(() => {
    if (!e0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 불러온 신청으로 입력칸을 한 번 채운다
    setF((x) => ({ ...x, departmentId: e0.department_id, content: e0.content, amount: Number(e0.amount), usedAt: e0.used_at ?? "" }));
    setAmountText(won(Number(e0.amount)));
  }, [e0]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const role = me.data?.role;
  const isDeptHead = role === "dept_head";
  const deptList = depts.data ?? [];
  // 부서장이 맡은 부서가 하나면 자동 선택
  const deptId = f.departmentId ?? (isDeptHead && deptList.length === 1 ? deptList[0].id : null);
  const useNew = newAccount || !saved.data;
  const set = (p: Partial<ExpenseForm>) => setF((x) => ({ ...x, ...p }));

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const blob = await shrink(file);
    setPhoto({ blob, url: URL.createObjectURL(blob), name: file.name });
  };

  // 사진은 드라이브(지출증빙/연/월)에 올린다. 드라이브 설정이 없으면 사진 없이 신청한다.
  const upload = async (): Promise<{ id: string | null; note?: string }> => {
    if (!photo) return { id: null };
    const fd = new FormData();
    const name = photo.blob.type === "image/jpeg" ? photo.name.replace(/\.\w+$/, "") + ".jpg" : photo.name;
    fd.append("file", new File([photo.blob], name, { type: photo.blob.type || "image/jpeg" }));
    fd.append("date", f.usedAt || localDate());
    fd.append("dept", deptList.find((d) => d.id === deptId)?.name ?? "");
    fd.append("content", f.content);
    fd.append("amount", String(f.amount));
    try {
      const res = await fetch("/api/receipts", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (res.ok) return { id: j.id };
      return { id: null, note: res.status === 503 ? "사진 저장 설정이 아직 없어 사진 없이 신청했어요. 영수증은 재정부에 따로 내 주세요." : `사진을 올리지 못해 사진 없이 신청했어요(${j.error ?? res.status}).` };
    } catch {
      return { id: null, note: "사진을 올리지 못해 사진 없이 신청했어요." };
    }
  };

  const submit = async () => {
    const form = { ...f, departmentId: deptId, ...(useNew ? {} : { bank: "", accountNo: "", holder: "" }) };
    const problems = expenseFormProblems(form, { needDept: isDeptHead, today: localDate() });
    if (useNew && !form.accountNo.trim()) problems.push("송금받을 계좌를 입력해 주세요");
    if (problems.length) return setMsg({ ok: false, text: problems.join(", ") });
    setBusy(true); setMsg(null);
    const up = await upload();
    const { error } = await sb.rpc("save_expense_request", {
      p_id: editId, p_department_id: form.departmentId, p_content: form.content.trim(), p_amount: form.amount,
      p_used_at: form.usedAt || null, p_drive_file_id: up.id ?? e0?.drive_file_id ?? null,
      p_bank: form.bank || null, p_account_no: form.accountNo || null, p_holder: form.holder || me.data?.name || null,
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: `신청하지 못했어요: ${dbError(error)}` });
    setDone([`${won(form.amount)}원 지출을 ${editId ? "고쳤어요" : "신청했어요"}. 재정부가 확인하면 '내 신청'에서 결과를 볼 수 있어요.`, up.note].filter(Boolean).join(" "));
    onSaved?.();
  };

  if (done)
    return (
      <div className={`${mCard} text-sm`}>
        <div className="mb-4 rounded bg-success-subtle px-3 py-2 text-success">{done}</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => location.assign(location.pathname)}
            className="rounded border border-line py-3 text-heading">하나 더 신청</button>
          <Link href={listHref} className="rounded bg-primary py-3 text-center text-white">내 신청 보기</Link>
        </div>
      </div>
    );
  if (editId && editing.data === null && !editing.loading) return <div className={`${mCard} text-sm text-label`}>신청을 찾을 수 없어요.</div>;
  if (e0 && !editable(e0.status)) return <div className={`${mCard} text-sm text-label`}>검토가 끝난 신청은 고칠 수 없어요.</div>;

  return (
    <div className={`${mCard} space-y-3 text-sm`}>
      {(me.error || depts.error || saved.error) && <div className="rounded bg-danger-subtle px-3 py-2 text-danger">{me.error ?? depts.error ?? saved.error}</div>}
      {editId && <div className="rounded bg-info-subtle px-3 py-2 text-info">신청 내용을 고치고 있어요.</div>}
      {isDeptHead && deptList.length !== 1 && (
        <label className="block text-xs text-label">부서
          <select value={deptId ?? ""} onChange={(e) => set({ departmentId: Number(e.target.value) || null })} className={mInput}>
            <option value="">부서 선택</option>
            {deptList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}
      {isDeptHead && deptList.length === 1 && <div className="text-xs text-label">부서 <b className="ml-1 text-sm text-heading">{deptList[0].name}</b></div>}
      {!isDeptHead && role && <div className="text-xs text-muted">부서·항목은 재정부가 확인하면서 정해요.</div>}

      <label className="block text-xs text-label">내용
        <input value={f.content} onChange={(e) => set({ content: e.target.value })} placeholder="예: 주보 인쇄용 복사지" className={mInput} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-label">금액(원)
          <input inputMode="numeric" value={amountText} onChange={(e) => { const n = toAmount(e.target.value); setAmountText(e.target.value ? won(n) : ""); set({ amount: n }); }} placeholder="0" className={mInput} />
        </label>
        <label className="block text-xs text-label">사용일
          <input type="date" value={f.usedAt} max={localDate()} onChange={(e) => set({ usedAt: e.target.value })} className={mInput} />
        </label>
      </div>

      <div className="text-xs text-label">영수증 사진
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        {photo ? (
          <div className="relative mt-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 미리보기 */}
            <img src={photo.url} alt="영수증 미리보기" className="max-h-60 w-full rounded border border-line object-contain" />
            <button onClick={() => setPhoto(null)} aria-label="사진 빼기" className="absolute right-2 top-2 rounded-full bg-surface px-2 py-1 text-label shadow-card"><FontAwesomeIcon icon={faXmark} /></button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="mt-1 flex w-full items-center justify-center gap-2 rounded border border-dashed border-line py-4 text-label">
            <FontAwesomeIcon icon={faCamera} /> {e0?.drive_file_id ? "사진 바꾸기(올린 사진 있음)" : "사진 찍기·고르기"}
          </button>
        )}
        <p className="mt-1 text-muted">글자 자동 인식은 아직 없어요. 내용·금액을 직접 입력해 주세요.</p>
      </div>

      <div className="text-xs text-label">송금받을 계좌
        {saved.data && !newAccount ? (
          <div className="mt-1 flex items-center gap-2 rounded border border-line px-3 py-2">
            <span className="flex-1 text-sm text-heading">{saved.data.bank} {saved.data.account}{saved.data.holder ? ` (${saved.data.holder})` : ""}</span>
            <button onClick={() => setNewAccount(true)} className="text-xs text-primary">다른 계좌</button>
          </div>
        ) : (
          <div className="mt-1 space-y-2">
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <input value={f.bank} onChange={(e) => set({ bank: e.target.value })} placeholder="은행" className="w-full rounded border px-3 py-2 text-base text-heading" />
              <input inputMode="numeric" value={f.accountNo} onChange={(e) => set({ accountNo: e.target.value })} placeholder="계좌번호" className="w-full rounded border px-3 py-2 text-base text-heading" />
            </div>
            <input value={f.holder} onChange={(e) => set({ holder: e.target.value })} placeholder={`예금주 (비우면 ${me.data?.name ?? "본인"})`} className="w-full rounded border px-3 py-2 text-base text-heading" />
            {saved.data && <button onClick={() => { setNewAccount(false); set({ bank: "", accountNo: "", holder: "" }); }} className="text-xs text-primary">저장된 계좌 쓰기</button>}
            <p className="text-muted">계좌번호는 암호화해서 저장하고, 화면에는 끝 4자리만 보여요.</p>
          </div>
        )}
      </div>

      {msg && <div className={`rounded px-3 py-2 ${msg.ok ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>{msg.text}</div>}
      <button onClick={submit} disabled={busy || me.loading} className={mButton}>{busy ? "보내는 중…" : editId ? "고친 내용으로 신청" : "지출 신청"}</button>
    </div>
  );
}
