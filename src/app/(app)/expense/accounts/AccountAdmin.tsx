"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchAll, isInUse } from "@/lib/settings/db";
import { matchMember, type MemberRow } from "@/lib/settings/members";
import { ACCOUNT_KINDS, cleanAccountNo, isAccountNo } from "@/lib/settings/payee";

type Kind = "bank_account" | "payee";
type Bank = { id: number; bank: string | null; holder: string | null; kind: string | null; is_primary: boolean; active: boolean; memo: string | null; has_account_no: boolean; account_mask: string | null };
type Payee = { id: number; member_id: number | null; member_name: string | null; name: string | null; bank: string | null; holder: string | null; memo: string | null; active: boolean; has_account_no: boolean; account_mask: string | null };
type Note = { ok: boolean; text: string } | null;

// 은행계좌관리: 재정부 계좌, 개인·업체 송금 계좌 (계좌번호는 암호화 저장, 목록은 가림)
export default function AccountAdmin() {
  const [note, setNote] = useState<Note>(null);
  return (
    <>
      <PageHeader />
      {note && <Notice kind={note.ok ? "ok" : "error"}>{note.text}</Notice>}
      <BankAccounts setNote={setNote} />
      <Payees setNote={setNote} />
    </>
  );
}

// 계좌번호 전체 보기: 재정부원만 복호화되고, 본 기록이 사용내역에 남는다
function useReveal(setNote: (n: Note) => void) {
  const sb = supabaseBrowser()!;
  const [shown, setShown] = useState<Record<string, string>>({});
  const toggle = async (kind: Kind, id: number) => {
    const k = `${kind}:${id}`;
    if (shown[k]) return setShown((s) => Object.fromEntries(Object.entries(s).filter(([x]) => x !== k)));
    const { data, error } = await sb.rpc("reveal_account_no", { p_kind: kind, p_id: id });
    if (error) return setNote({ ok: false, text: dbError(error) });
    setShown((s) => ({ ...s, [k]: (data as string | null) ?? "(없음)" }));
  };
  return { shown: (kind: Kind, id: number) => shown[`${kind}:${id}`], toggle };
}

// 쓰인 적 있는 계좌(은행거래·지출에 연결)는 지우지 않고 사용 안 함으로
async function removeOrDeactivate(kind: Kind, id: number, label: string): Promise<string> {
  const sb = supabaseBrowser()!;
  const { error } = await sb.from(kind).delete().eq("id", id);
  if (!error) return `${label} 계좌를 삭제했어요.`;
  if (!isInUse(error)) throw error;
  must(await sb.from(kind).update({ active: false }).eq("id", id).select("id"));
  return `${label} 계좌는 이미 쓰인 기록이 있어 '사용 안 함'으로 바꿨어요.`;
}

function AccountInput({ value, onChange, saved }: { value: string; onChange: (v: string) => void; saved: string | null }) {
  const bad = value !== "" && !isAccountNo(value);
  return (
    <label className="text-xs text-label">계좌번호 {saved && <span className="text-muted">(저장됨: {saved})</span>}
      <input value={value} onChange={(e) => onChange(cleanAccountNo(e.target.value))} autoComplete="off" inputMode="numeric"
        placeholder={saved ? "바꿀 때만 입력" : "숫자와 - 만"} className={`${input} mt-1 w-full ${bad ? "border-danger" : ""}`} />
      {bad && <span className="text-danger">숫자 6자리 이상</span>}
    </label>
  );
}

const blankBank = { id: null as number | null, bank: "", account_no: "", holder: "", kind: "일반", is_primary: false, active: true, memo: "" };

function BankAccounts({ setNote }: { setNote: (n: Note) => void }) {
  const sb = supabaseBrowser()!;
  const q = useDbQuery(async (sb) => must(await sb.from("v_bank_account").select("*").order("is_primary", { ascending: false }).order("id")) as Bank[], []);
  const [f, setF] = useState(blankBank);
  const [busy, setBusy] = useState(false);
  const reveal = useReveal(setNote);
  const editing = q.data?.find((b) => b.id === f.id);

  const act = async (fn: () => Promise<string>) => {
    setBusy(true); setNote(null);
    try { setNote({ ok: true, text: await fn() }); q.reload(); } catch (e) { setNote({ ok: false, text: dbError(e) }); } finally { setBusy(false); }
  };
  const save = () => act(async () => {
    must(await sb.rpc("save_bank_account", { p: { ...f, account_no: f.account_no || null } }));
    setF(blankBank);
    return `${f.bank} 계좌를 저장했어요.`;
  });
  const can = f.bank.trim() && (f.account_no === "" || isAccountNo(f.account_no)) && (f.id || f.account_no);

  return (
    <section className="mb-8">
      <h2 className="mb-2 font-semibold text-heading">재정부 계좌</h2>
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      <div className={`${card} mb-3 p-4 text-sm`}>
        <div className="grid gap-3 md:grid-cols-[140px_1fr_140px_110px_1fr_auto]">
          <label className="text-xs text-label">은행 *<input value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} className={`${input} mt-1 w-full`} /></label>
          <AccountInput value={f.account_no} onChange={(v) => setF({ ...f, account_no: v })} saved={editing?.account_mask ?? null} />
          <label className="text-xs text-label">예금주<input value={f.holder} onChange={(e) => setF({ ...f, holder: e.target.value })} className={`${input} mt-1 w-full`} /></label>
          <label className="text-xs text-label">종류
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={`${input} mt-1 w-full`}>
              {ACCOUNT_KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label className="text-xs text-label">메모<input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} className={`${input} mt-1 w-full`} /></label>
          <div className="flex items-end gap-2">
            <button onClick={save} disabled={busy || !can} className={btnPrimary}>{f.id ? "수정" : "추가"}</button>
            {f.id && <button onClick={() => setF(blankBank)} className={btn}>취소</button>}
          </div>
        </div>
        <div className="mt-2 flex gap-4">
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.is_primary} onChange={(e) => setF({ ...f, is_primary: e.target.checked })} /> 주계좌(하나만)</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> 사용 중</label>
        </div>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="px-3 py-2 text-left">은행</th><th className="text-left">계좌번호</th><th className="text-left">예금주</th><th>종류</th><th className="text-left">메모</th><th className="w-40" /></tr>
          </thead>
          <tbody>
            {q.data?.map((b) => (
              <tr key={b.id} className={`border-t ${b.active ? "" : "text-muted"} ${f.id === b.id ? "bg-primary-subtle" : ""}`}>
                <td className="px-3 py-1.5 text-heading">{b.bank}
                  {b.is_primary && <span className="ml-1 rounded bg-info-subtle px-1 text-xs text-info">주계좌</span>}
                  {!b.active && <span className="ml-1 rounded bg-danger-subtle px-1 text-xs text-danger">사용 안 함</span>}</td>
                <td className="whitespace-nowrap font-mono text-xs">{reveal.shown("bank_account", b.id) ?? b.account_mask ?? "-"}
                  {b.has_account_no && <button onClick={() => reveal.toggle("bank_account", b.id)} className="ml-2 font-sans text-primary">{reveal.shown("bank_account", b.id) ? "가리기" : "전체 보기"}</button>}</td>
                <td>{b.holder}</td>
                <td className="text-center">{b.kind}</td>
                <td className="text-label">{b.memo}</td>
                <td className="px-3 text-right text-xs">
                  <button onClick={() => setF({ id: b.id, bank: b.bank ?? "", account_no: "", holder: b.holder ?? "", kind: b.kind ?? "일반", is_primary: b.is_primary, active: b.active, memo: b.memo ?? "" })} className="text-primary">수정</button>{" "}
                  <button onClick={() => confirm(`${b.bank} 계좌를 삭제할까요?`) && act(() => removeOrDeactivate("bank_account", b.id, b.bank ?? ""))} className="text-danger">삭제</button>
                </td>
              </tr>
            ))}
            {q.data && !q.data.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">등록된 재정부 계좌가 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const blankPayee = { id: null as number | null, member_id: null as number | null, member_name: "", name: "", bank: "", account_no: "", holder: "", memo: "", active: true };

function Payees({ setNote }: { setNote: (n: Note) => void }) {
  const sb = supabaseBrowser()!;
  const q = useDbQuery((sb) => fetchAll<Payee>(() => sb.from("v_payee").select("*").order("name").order("id")), []);
  const members = useDbQuery((sb) => fetchAll<Pick<MemberRow, "id" | "full_name" | "title" | "district" | "zone">>(() => sb.from("v_member").select("id, full_name, title, district, zone").eq("active", true).order("name").order("id")), []);
  const [f, setF] = useState(blankPayee);
  const [mq, setMq] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const reveal = useReveal(setNote);
  const editing = q.data?.find((p) => p.id === f.id);
  const found = mq.trim() ? (members.data ?? []).filter((m) => matchMember(m, mq)).slice(0, 6) : [];
  const list = useMemo(() => {
    const k = search.replace(/\s/g, "");
    return (q.data ?? []).filter((p) => !k || [p.name, p.member_name, p.holder, p.bank, p.memo].some((v) => (v ?? "").replace(/\s/g, "").includes(k)));
  }, [q.data, search]);

  const act = async (fn: () => Promise<string>) => {
    setBusy(true); setNote(null);
    try { setNote({ ok: true, text: await fn() }); q.reload(); } catch (e) { setNote({ ok: false, text: dbError(e) }); } finally { setBusy(false); }
  };
  const save = () => act(async () => {
    const p = { id: f.id, member_id: f.member_id, name: f.name, bank: f.bank, holder: f.holder, memo: f.memo, active: f.active, account_no: f.account_no || null };
    must(await sb.rpc("save_payee", { p }));
    setF(blankPayee);
    return `${f.name} 송금 계좌를 저장했어요.`;
  });
  const pick = (m: Pick<MemberRow, "id" | "full_name">) => {
    setMq("");
    setF((x) => ({ ...x, member_id: m.id, member_name: m.full_name, name: x.name || m.full_name, holder: x.holder || m.full_name }));
  };
  const can = f.name.trim() && (f.account_no === "" || isAccountNo(f.account_no)) && (f.id || f.account_no);

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-heading">개인·업체 송금 계좌</h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름·은행·메모 검색" className={`${input} w-56`} />
      </div>
      {(q.error || members.error) && <Notice kind="error">불러오지 못했어요: {q.error ?? members.error}</Notice>}
      <div className={`${card} mb-3 p-4 text-sm`}>
        <div className="grid gap-3 md:grid-cols-[180px_1fr_120px_1fr_120px]">
          <div className="relative text-xs text-label">연결 교인(선택)
            {f.member_id
              ? <div className="mt-1 flex items-center gap-2 py-1.5 text-sm text-heading">{f.member_name}<button onClick={() => setF({ ...f, member_id: null, member_name: "" })} className="text-xs text-danger">해제</button></div>
              : <input value={mq} onChange={(e) => setMq(e.target.value)} placeholder="교인 검색" className={`${input} mt-1 w-full`} />}
            {found.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded border bg-surface text-sm text-heading shadow">
                {found.map((m) => <li key={m.id}><button onClick={() => pick(m)} className="w-full px-2 py-1 text-left hover:bg-surface-2">{m.full_name} <span className="text-xs text-muted">{m.title}</span></button></li>)}
              </ul>
            )}
          </div>
          <label className="text-xs text-label">이름(송금 표시) *<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="개인 이름 또는 업체명" className={`${input} mt-1 w-full`} /></label>
          <label className="text-xs text-label">은행<input value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} className={`${input} mt-1 w-full`} /></label>
          <AccountInput value={f.account_no} onChange={(v) => setF({ ...f, account_no: v })} saved={editing?.account_mask ?? null} />
          <label className="text-xs text-label">예금주<input value={f.holder} onChange={(e) => setF({ ...f, holder: e.target.value })} className={`${input} mt-1 w-full`} /></label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} placeholder="메모" className={`${input} min-w-0 flex-1`} />
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> 사용 중</label>
          <button onClick={save} disabled={busy || !can} className={btnPrimary}>{f.id ? "수정" : "추가"}</button>
          {f.id && <button onClick={() => setF(blankPayee)} className={btn}>취소</button>}
        </div>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="px-3 py-2 text-left">이름</th><th className="text-left">교인</th><th className="text-left">은행</th><th className="text-left">계좌번호</th><th className="text-left">예금주</th><th className="text-left">메모</th><th className="w-28" /></tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className={`border-t ${p.active ? "" : "text-muted"} ${f.id === p.id ? "bg-primary-subtle" : ""}`}>
                <td className="px-3 py-1.5 text-heading">{p.name}{!p.active && <span className="ml-1 rounded bg-danger-subtle px-1 text-xs text-danger">사용 안 함</span>}</td>
                <td className="text-label">{p.member_name}</td>
                <td>{p.bank}</td>
                <td className="whitespace-nowrap font-mono text-xs">{reveal.shown("payee", p.id) ?? p.account_mask ?? "-"}
                  {p.has_account_no && <button onClick={() => reveal.toggle("payee", p.id)} className="ml-2 font-sans text-primary">{reveal.shown("payee", p.id) ? "가리기" : "전체 보기"}</button>}</td>
                <td>{p.holder}</td>
                <td className="text-label">{p.memo}</td>
                <td className="px-3 text-right text-xs">
                  <button onClick={() => setF({ id: p.id, member_id: p.member_id, member_name: p.member_name ?? "", name: p.name ?? "", bank: p.bank ?? "", account_no: "", holder: p.holder ?? "", memo: p.memo ?? "", active: p.active })} className="text-primary">수정</button>{" "}
                  <button onClick={() => confirm(`${p.name} 계좌를 삭제할까요?`) && act(() => removeOrDeactivate("payee", p.id, p.name ?? ""))} className="text-danger">삭제</button>
                </td>
              </tr>
            ))}
            {q.data && !list.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">송금 계좌가 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">계좌번호는 암호화해서 저장하고 목록에는 뒤 4자리만 보여요. 전체 보기는 재정부원만 되고 사용내역에 남아요. 지출입력의 송금파일은 여기 &apos;이름·교인·예금주&apos;로 계좌를 찾아요.</p>
    </section>
  );
}
