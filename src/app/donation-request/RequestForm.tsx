"use client";
// 공개 기부금영수증 신청(로그인 없음). 저장은 submit_donation_request RPC 하나로만.
// 이전 신청자는 성명+휴대폰만 → 지난 정보는 서버에서만 이어 쓰고 화면에 돌려주지 않는다.
import { useState } from "react";
import { isDbConfigured } from "@/lib/supabase/config";
import { supabaseBrowser } from "@/lib/supabase/client";
import { browserHash } from "@/lib/receipt/fingerprint";
import { normalizePhone, normalizeRrn, splitNames } from "@/lib/receipt/validate";

const field = "mt-1 w-full rounded border border-line px-3 py-2.5 text-base text-heading";
const label = "block text-sm text-label";

export default function RequestForm() {
  const thisYear = new Date().getFullYear();
  const [returning, setReturning] = useState(false);
  const [f, setF] = useState({ name: "", rrn1: "", rrn2: "", phone: "", address: "", note: "", family: "", website: "" });
  const [year, setYear] = useState(thisYear - 1);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (f.name.trim().length < 2) return setErr("성명을 넣어 주세요.");
    const phone = normalizePhone(f.phone);
    if (!phone) return setErr("휴대폰번호를 확인해 주세요. 예) 010-1234-5678");
    const rrn = returning ? "" : normalizeRrn(f.rrn1 + f.rrn2);
    if (rrn === null) return setErr("주민등록번호 13자리를 확인해 주세요.");
    if (!returning && !f.address.trim()) return setErr("도로명주소를 넣어 주세요.");
    if (!consent) return setErr("개인정보 수집·이용에 동의해 주세요.");
    const sb = supabaseBrowser();
    if (!sb) return setErr("지금은 신청을 받을 수 없어요(시스템 준비 중).");
    setBusy(true);
    try {
      const { data, error } = await sb.rpc("submit_donation_request", {
        p: {
          name: f.name.trim(), phone, returning, year, consent, website: f.website, fp: await browserHash(),
          ...(returning ? {} : { rrn, address: f.address.trim() }),
          note: f.note.trim(), family_names: splitNames(f.family),
        },
      });
      if (error) throw error;
      const res = data as { ok: boolean; request_no?: string; error?: string };
      if (!res.ok) return setErr(res.error ?? "신청하지 못했어요.");
      setDone(res.request_no ?? "");
      setF({ name: "", rrn1: "", rrn2: "", phone: "", address: "", note: "", family: "", website: "" });
    } catch {
      setErr("신청하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally { setBusy(false); }
  };

  if (done !== null) return (
    <div className="rounded-lg bg-surface p-6 text-center shadow-card">
      <div className="text-sm text-label">신청이 접수됐어요</div>
      <div className="my-3 font-mono text-2xl font-bold text-heading">{done}</div>
      <p className="text-sm text-slate-600">접수번호를 적어 두세요. 재정부 확인 후 발급하고, 영수증은 본인 헌금봉투 찾는 곳에 꽂아 둡니다.</p>
      <button onClick={() => setDone(null)} className="mt-5 rounded border border-line px-4 py-2 text-sm">처음으로</button>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg bg-surface p-4 shadow-card" autoComplete="off" noValidate>
      {!isDbConfigured && <div className="rounded bg-warning-subtle px-3 py-2 text-sm text-warning">지금은 데모 모드라 신청이 저장되지 않아요.</div>}
      <div className="grid grid-cols-2 overflow-hidden rounded border border-line text-sm">
        {[[false, "처음 신청"], [true, "이전에 신청했어요"]].map(([v, l]) => (
          <button type="button" key={String(v)} onClick={() => { setReturning(v as boolean); setErr(""); }}
            className={`py-2.5 ${returning === v ? "bg-primary text-white" : "text-slate-600"}`}>{l as string}</button>
        ))}
      </div>
      {returning && <p className="rounded bg-info-subtle px-3 py-2 text-sm text-info">성명과 휴대폰번호만 넣으세요. 지난번 신청 정보로 접수해요(화면에는 보여드리지 않아요). 주소가 바뀌었으면 처음 신청으로 해 주세요.</p>}

      <label className={label}>기부 연도
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={field}>
          {[thisYear - 1, thisYear].map((y) => <option key={y} value={y}>{y}년 헌금분</option>)}
        </select>
      </label>
      <label className={label}>성명
        <input value={f.name} onChange={set("name")} autoComplete="name" className={field} />
      </label>
      {!returning && (
        <div className={label}>주민등록번호
          <div className="mt-1 flex items-center gap-2">
            <input value={f.rrn1} onChange={(e) => setF({ ...f, rrn1: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" placeholder="앞 6자리" aria-label="주민등록번호 앞자리" className={`${field} mt-0`} />
            <span>-</span>
            <input value={f.rrn2} onChange={(e) => setF({ ...f, rrn2: e.target.value.replace(/\D/g, "").slice(0, 7) })} type="password" inputMode="numeric" placeholder="뒤 7자리" aria-label="주민등록번호 뒷자리" className={`${field} mt-0`} />
          </div>
          <span className="mt-1 block text-xs text-muted">연말정산 기부금 공제에 필요해요. 암호화해서 저장해요.</span>
        </div>
      )}
      <label className={label}>휴대폰번호
        <input value={f.phone} onChange={set("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" className={field} />
      </label>
      {!returning && (
        <label className={label}>주소(도로명)
          <input value={f.address} onChange={set("address")} autoComplete="street-address" placeholder="예) 서울시 가상구 가상로 1, 101동 101호" className={field} />
        </label>
      )}
      <label className={label}>함께 헌금한 가족(선택)
        <input value={f.family} onChange={set("family")} placeholder="쉼표로 구분, 예) 가나라, 가나마" className={field} />
      </label>
      <label className={label}>요청주실 말씀(선택)
        <textarea value={f.note} onChange={set("note")} rows={3} maxLength={500} className={field} />
      </label>
      {/* 봇 방지: 사람에게는 안 보이는 칸 */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>웹사이트<input tabIndex={-1} value={f.website} onChange={set("website")} autoComplete="off" /></label>
      </div>

      <div className="rounded border border-line p-3 text-xs text-slate-600">
        <div className="mb-1 font-semibold text-heading">개인정보 수집·이용 동의(필수)</div>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>항목: 성명, 주민등록번호, 휴대폰번호, 주소, 가족명단</li>
          <li>목적: 기부금영수증 발급(소득세법)</li>
          <li>보관: 발급 후 [확인 필요: 보관기간] 동안 보관 후 파기</li>
          <li>동의하지 않으면 온라인 신청을 할 수 없어요(재정부에 종이 신청서로 내셔도 돼요).</li>
        </ul>
        <label className="mt-2 flex items-center gap-2 text-sm text-heading">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-5 w-5" /> 동의합니다
        </label>
      </div>

      {err && <div className="rounded bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">{err}</div>}
      <button type="submit" disabled={busy} className="w-full rounded bg-primary py-3 text-base font-semibold text-white disabled:bg-slate-300">{busy ? "보내는 중…" : "신청하기"}</button>
      <p className="text-center text-xs text-muted">발급된 영수증은 본인 헌금봉투 찾는 곳에 꽂아 둡니다.</p>
    </form>
  );
}
