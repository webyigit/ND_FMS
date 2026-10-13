"use client";
// 해외선교(네팔 포함) 수입·지출 입력. 장부 '해외선교' 시트처럼 주일마다 헌금(해외선교·네팔선교)과 지출(선교사 후원·네팔 구호 등)을 넣는다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { type Member } from "@/lib/demo";
import { sundayOf, upcomingSunday } from "@/lib/income/dates";
import { useRefData, type RefData } from "@/lib/db/refData";
import { dbError, expenseProblems, expenseSig, incomeSig, loadExpense, loadIncome, saveExpense, saveIncome, type ExpenseRow, type IncomeEntry } from "@/lib/db/weekly";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useListNav } from "@/lib/listNav";
import { MISSION_DEPT, incomeTotals, isMissionExpense, isMissionIncome, mergeExpense, mergeIncome } from "@/lib/mission/entry";

const won = (n: number) => n.toLocaleString("ko-KR");
const blank = (item = ""): ExpenseRow => ({ id: crypto.randomUUID(), content: "", amount: 0, dept: MISSION_DEPT, item, requester: "", memo: "", source: "직접" });

export default function MissionEntry() {
  return <DbOnly what="해외선교 입력"><Loader /></DbOnly>;
}

function Loader() {
  const { ref, error } = useRefData();
  if (error) return <><PageHeader /><Notice kind="error">기준정보를 불러오지 못했어요: {error}</Notice></>;
  if (!ref) return <><PageHeader /><div className="text-sm text-muted">불러오는 중…</div></>;
  const types = ref.offeringTypes.filter((t) => t.fund === "별도");
  const items = ref.departments[MISSION_DEPT] ?? [];
  if (!types.length || !items.length) return <><PageHeader /><Notice kind="warn">해외선교 헌금구분(별도 기금) 또는 지출 부서 &lsquo;해외선교&rsquo; 항목이 없어요. 설정 &gt; 헌금구분을 확인해 주세요.</Notice></>;
  return <Form ref_={ref} />;
}

function Form({ ref_ }: { ref_: RefData }) {
  const sb = supabaseBrowser()!;
  const TYPES = useMemo(() => ref_.offeringTypes.filter((t) => t.fund === "별도"), [ref_]);
  const typeIds = useMemo(() => TYPES.map((t) => t.id), [TYPES]);
  const ITEMS = ref_.departments[MISSION_DEPT];
  const MEMBERS = ref_.members;

  const [tab, setTab] = useState<"income" | "expense">("income");
  const [sunday, setSunday] = useState(() => upcomingSunday());
  const [inc, setInc] = useState<IncomeEntry[]>([]);
  const [exp, setExp] = useState<ExpenseRow[]>([]);
  const [sig, setSig] = useState({ inc: "[]", exp: "[]" });
  const [busy, setBusy] = useState(true);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const incDirty = incomeSig(inc) !== sig.inc;
  const expDirty = expenseSig(exp) !== sig.exp;
  const dirty = incDirty || expDirty;

  // 처음 열 때는 busy=true로 시작하고, 주일을 바꿀 때 changeSunday가 켠다
  const pull = useCallback((day: string) =>
    Promise.all([loadIncome(sb, day), loadExpense(sb, day)]).then(([i, e]) => {
      const mi = i.filter(isMissionIncome(typeIds)), me = e.filter(isMissionExpense);
      setInc(mi); setExp(me); setSig({ inc: incomeSig(mi), exp: expenseSig(me) });
    }, (err) => setNote({ ok: false, text: `불러오지 못했어요: ${dbError(err)}` })).finally(() => setBusy(false)),
  [sb, typeIds]);

  useEffect(() => { void pull(sunday); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changeSunday = (picked: string) => {
    if (!picked) return;
    const day = sundayOf(picked, "next"); // 주일이 아닌 날을 고르면 그 주의 주일로
    if (day === sunday) return;
    if (dirty && !confirm("저장하지 않은 입력이 있어요. 버리고 다른 주일로 갈까요?")) return;
    setSunday(day); setNote(null); setBusy(true); void pull(day);
  };

  // 저장 직전에 그 주일 전체를 다시 읽어 일반·특별 행은 DB 그대로 두고 해외선교 행만 바꾼다
  const save = async () => {
    const problems = expenseProblems(exp);
    if (expDirty && problems.length) { setTab("expense"); return setNote({ ok: false, text: `지출: ${problems.join(", ")}` }); }
    setBusy(true); setNote(null);
    try {
      const done: string[] = [];
      if (incDirty) { await saveIncome(sb, sunday, mergeIncome(await loadIncome(sb, sunday), inc, typeIds)); done.push(`수입 ${inc.length}건`); }
      if (expDirty) { await saveExpense(sb, sunday, mergeExpense(await loadExpense(sb, sunday), exp)); done.push(`지출 ${exp.length}건`); }
      await pull(sunday); // 새 행의 DB id를 받아 다음 저장 때 같은 행을 고치게
      setNote({ ok: true, text: `${sunday} 주일 해외선교 ${done.join(", ")}을 저장했어요.` });
    } catch (err) { setNote({ ok: false, text: `저장하지 못했어요: ${dbError(err)}` }); }
    finally { setBusy(false); }
  };

  const incTotal = inc.reduce((s, e) => s + e.amount, 0);
  const expTotal = exp.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <PageHeader actions={dirty && <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">저장 안 됨</span>} />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-surface p-4 text-sm shadow-card">
        <label className="text-xs text-label">주일
          <input type="date" value={sunday} onChange={(e) => changeSunday(e.target.value)} className="mt-1 block rounded border px-2 py-1.5 text-sm text-heading" />
            {sunday !== upcomingSunday() && <button type="button" onClick={() => changeSunday(upcomingSunday())} className="mt-1 block text-xs text-primary underline">돌아오는 주일로</button>}
        </label>
        <div className="seg flex overflow-hidden rounded border" role="tablist">
          {([["income", `수입 ${inc.length}건 · ${won(incTotal)}`], ["expense", `지출 ${exp.length}건 · ${won(expTotal)}`]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-4 py-1.5 ${tab === k ? "bg-primary text-white" : "text-slate-700"}`}>{l}</button>
          ))}
        </div>
        <button onClick={save} disabled={busy || !dirty} className={`${btnPrimary} ml-auto`}>{busy ? "처리 중…" : dirty ? "입력 완료(저장)" : "저장됨"}</button>
        <Link href="/mission" className={btn}>해외선교 현황</Link>
      </div>
      {note && <Notice kind={note.ok ? "ok" : "error"}>{note.text}</Notice>}
      <p className="mb-3 text-xs text-muted">해외선교(별도 기금)만 다뤄요. 같은 주일의 일반·특별 수입·지출은 수입입력·지출입력 화면 그대로 두고 저장해요.</p>

      {tab === "income"
        ? <IncomePart types={TYPES} members={MEMBERS} rows={inc} setRows={setInc} />
        : <ExpensePart items={ITEMS} members={MEMBERS} rows={exp} setRows={setExp} />}
    </>
  );
}

function IncomePart({ types, members, rows, setRows }: { types: RefData["offeringTypes"]; members: Member[]; rows: IncomeEntry[]; setRows: (f: (xs: IncomeEntry[]) => IncomeEntry[]) => void }) {
  const [typeId, setTypeId] = useState(types[0].id);
  const [channel, setChannel] = useState<"cash" | "online">("cash");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Member | null>(null);
  const [amount, setAmount] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const type = types.find((t) => t.id === typeId) ?? types[0];
  const unit = type.unit ?? 1;

  const suggestions = useMemo(() => (query.length >= 2 && !picked ? members.filter((m) => m.name.includes(query)).slice(0, 8) : []), [query, picked, members]);
  const pick = (m: Member) => { setPicked(m); setQuery(m.name); amountRef.current?.focus(); };
  const nav = useListNav(suggestions, pick, query);
  const reset = () => { setQuery(""); setPicked(null); setAmount(""); setEditId(null); };

  const submit = () => {
    const n = Number(amount.replace(/,/g, "")) * unit;
    if (!n) return amountRef.current?.focus();
    if (!type.totalOnly && !picked && !query.trim()) return nameRef.current?.focus();
    const e: IncomeEntry = {
      id: editId ?? crypto.randomUUID(), typeId, channel,
      memberId: type.totalOnly ? null : picked?.id ?? null,
      name: type.totalOnly ? "(총액)" : picked?.name ?? query.trim(),
      amount: n, memo: "",
    };
    setRows((xs) => (editId ? xs.map((x) => (x.id === editId ? e : x)) : [...xs, e]));
    reset();
    (type.totalOnly ? amountRef : nameRef).current?.focus();
  };
  const edit = (e: IncomeEntry) => {
    setEditId(e.id); setTypeId(e.typeId); setChannel(e.channel);
    setPicked(members.find((m) => m.id === e.memberId) ?? (e.memberId != null ? { id: e.memberId, name: e.name } : null)); setQuery(e.name);
    setAmount(String(e.amount / (types.find((t) => t.id === e.typeId)?.unit ?? 1)));
  };
  const totals = incomeTotals(rows, types);

  return (
    <>
      <div className={`${card} mb-4 p-4`}>
        <div className="grid gap-3 md:grid-cols-[160px_150px_1fr_160px_auto]">
          <label className="text-xs text-label">헌금구분
            <select value={typeId} onChange={(e) => { setTypeId(Number(e.target.value)); reset(); }} className={`${input} mt-1 w-full`}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <div className="text-xs text-label">구분
            <div className="seg mt-1 flex overflow-hidden rounded border text-sm">
              {(["cash", "online"] as const).map((c) => (
                <button key={c} onClick={() => setChannel(c)} className={`flex-1 px-4 py-1.5 ${channel === c ? "bg-primary text-white" : "text-slate-700"}`}>{c === "cash" ? "현금" : "이체"}</button>
              ))}
            </div>
          </div>
          <div className="relative text-xs text-label">이름 {type.totalOnly && "(총액만 입력)"}
            <input ref={nameRef} disabled={type.totalOnly} value={query} placeholder="두 글자 이상 입력"
              onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
              onKeyDown={(e) => { if (nav.onKeyDown(e)) return; if (e.key === "Enter") { if (suggestions[0]) { setPicked(suggestions[0]); setQuery(suggestions[0].name); } amountRef.current?.focus(); } }}
              className={`${input} mt-1 w-full disabled:bg-surface-2`} />
            {suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded border bg-surface text-sm text-heading shadow">
                {suggestions.map((m, i) => (
                  <li key={m.id} {...nav.itemProps(i)}><button className="w-full px-2 py-1 text-left hover:bg-surface-2" onClick={() => pick(m)}>{m.name} {m.title && <span className="text-muted">{m.title}</span>}</button></li>
                ))}
              </ul>
            )}
          </div>
          <label className="text-xs text-label">금액 {unit > 1 && `(×${won(unit)}원)`}
            <input ref={amountRef} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && submit()} className={`${input} mt-1 w-full text-right`} />
          </label>
          <div className="flex items-end gap-2">
            <button onClick={submit} className={btnPrimary}>{editId ? "수정" : "추가"}</button>
            {editId && <button onClick={reset} className={btn}>취소</button>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {totals.map((t) => (
          <div key={t.id} className={card}>
            <div className="flex justify-between border-b px-4 py-2 text-sm font-semibold"><span>{t.name} · {t.count}건</span><span>{won(t.total)}</span></div>
            <table className="w-full text-sm"><tbody>
              {rows.filter((r) => r.typeId === t.id).map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-1.5">{r.name}</td>
                  <td className="px-2 text-xs text-muted">{r.channel === "cash" ? "현금" : "이체"}</td>
                  <td className="px-2 text-right">{won(r.amount)}</td>
                  <td className="w-24 px-2 text-right text-xs">
                    <button onClick={() => edit(r)} className="text-primary">수정</button>{" "}
                    <button onClick={() => setRows((xs) => xs.filter((x) => x.id !== r.id))} className="text-red-500">삭제</button>
                  </td>
                </tr>
              ))}
              {!t.count && <tr><td className="px-4 py-3 text-center text-muted">입력 없음</td></tr>}
            </tbody></table>
          </div>
        ))}
      </div>
    </>
  );
}

function ExpensePart({ items, members, rows, setRows }: { items: string[]; members: Member[]; rows: ExpenseRow[]; setRows: (f: (xs: ExpenseRow[]) => ExpenseRow[]) => void }) {
  const set = (id: string, patch: Partial<ExpenseRow>) => setRows((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const byItem = items.map((it) => ({ it, total: rows.filter((r) => r.item === it).reduce((s, r) => s + r.amount, 0) })).filter((x) => x.total);
  const cell = "w-full rounded border px-1.5 py-1 text-sm";
  return (
    <>
      <datalist id="mission-members">{members.map((m) => <option key={m.id} value={m.name} />)}</datalist>
      <div className="tbl-scroll overflow-x-auto rounded-lg bg-surface shadow-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="w-10 py-2">#</th><th className="w-40">항목</th><th className="text-left">내용(선교사·선교지)</th><th className="w-32 text-right">금액</th><th className="w-32">청구자</th><th className="text-left">비고</th><th className="w-12" /></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t">
                <td className="text-center text-muted">{i + 1}</td>
                <td className="px-1 py-1"><select className={cell} value={r.item} onChange={(e) => set(r.id, { item: e.target.value })}><option value="">선택</option>{items.map((x) => <option key={x}>{x}</option>)}</select></td>
                <td className="px-1"><input className={cell} value={r.content} onChange={(e) => set(r.id, { content: e.target.value })} /></td>
                <td className="px-1"><input className={`${cell} text-right`} inputMode="numeric" value={r.amount ? won(r.amount) : ""} onChange={(e) => set(r.id, { amount: Number(e.target.value.replace(/\D/g, "")) })} /></td>
                <td className="px-1"><input className={cell} list="mission-members" value={r.requester} onChange={(e) => set(r.id, { requester: e.target.value })} /></td>
                <td className="px-1"><input className={cell} value={r.memo} onChange={(e) => set(r.id, { memo: e.target.value })} /></td>
                <td className="text-center"><button onClick={() => setRows((xs) => xs.filter((x) => x.id !== r.id))} className="text-xs text-red-500">삭제</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="py-4 text-center text-muted">이 주일 해외선교 지출이 없어요. 아래 &lsquo;행 추가&rsquo;로 넣어요.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <button onClick={() => setRows((xs) => [...xs, blank()])} className={btn}>행 추가</button>
        {byItem.map(({ it, total }) => <div key={it} className="rounded-lg bg-surface px-4 py-2 shadow-card">{it} {won(total)}</div>)}
      </div>
    </>
  );
}
