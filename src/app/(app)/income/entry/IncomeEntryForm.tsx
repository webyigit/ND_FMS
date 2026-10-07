"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MEMBERS, OFFERING_TYPES, currentSunday, type Member } from "@/lib/demo";
import { sortForList } from "@/lib/offeringOrder";

type Entry = { id: string; typeId: number; channel: "cash" | "online"; memberId: number | null; name: string; amount: number; memo: string };

const KEY_TYPE = "ndfms.income.type"; // 헌금구분은 바꾸기 전까지 유지
const KEY_DRAFT = "ndfms.income.draft"; // 완료 전까지 계속 입력(임시저장)
const won = (n: number) => n.toLocaleString("ko-KR");
const load = <T,>(k: string, d: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
};

export default function IncomeEntryForm() {
  const [sunday, setSunday] = useState(currentSunday);
  const [typeId, setTypeId] = useState(() => load(KEY_TYPE, 1));
  const [channel, setChannel] = useState<"cash" | "online">("cash");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Member | null>(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [entries, setEntries] = useState<Entry[]>(() => load<Entry[]>(KEY_DRAFT, []));
  const [editId, setEditId] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => { try { localStorage.setItem(KEY_TYPE, JSON.stringify(typeId)); } catch {} }, [typeId]);
  useEffect(() => { try { localStorage.setItem(KEY_DRAFT, JSON.stringify(entries)); } catch {} }, [entries]);

  const type = OFFERING_TYPES.find((t) => t.id === typeId) ?? OFFERING_TYPES[0];
  const unit = type.unit ?? 1;
  const suggestions = useMemo(
    () => (query.length >= 2 && !picked ? MEMBERS.filter((m) => m.name.includes(query)).slice(0, 8) : []),
    [query, picked],
  );

  const reset = () => { setQuery(""); setPicked(null); setAmount(""); setMemo(""); setEditId(null); };

  const submit = () => {
    const n = Number(amount.replace(/,/g, "")) * unit;
    if (!n) return amountRef.current?.focus();
    if (!type.totalOnly && !picked && !query.trim()) return nameRef.current?.focus();
    const e: Entry = {
      id: editId ?? crypto.randomUUID(), typeId, channel,
      memberId: type.totalOnly ? null : picked?.id ?? null,
      name: type.totalOnly ? "(총액)" : picked?.name ?? query.trim(), // 미등록 이름·가족 묶음은 그대로 저장
      amount: n, memo,
    };
    setEntries((xs) => (editId ? xs.map((x) => (x.id === editId ? e : x)) : [...xs, e]));
    reset();
    (type.totalOnly ? amountRef : nameRef).current?.focus();
  };

  const edit = (e: Entry) => {
    setEditId(e.id); setTypeId(e.typeId); setChannel(e.channel);
    setPicked(MEMBERS.find((m) => m.id === e.memberId) ?? null); setQuery(e.name);
    setAmount(String(e.amount / (OFFERING_TYPES.find((t) => t.id === e.typeId)?.unit ?? 1))); setMemo(e.memo);
  };

  const byType = OFFERING_TYPES.map((t) => {
    const rows = entries.filter((e) => e.typeId === t.id);
    const ranked = sortForList(rows.map((r) => ({ ...r, displayRank: MEMBERS.find((m) => m.id === r.memberId)?.displayRank })));
    return { t, rows: ranked, total: rows.reduce((s, r) => s + r.amount, 0) };
  }).filter((g) => g.rows.length);
  const grand = entries.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <PageHeader actions={<span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">데모 데이터 · DB 연결 전 브라우저에만 임시저장</span>} />

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[140px_180px_160px_1fr_160px_auto]">
          <label className="text-xs text-slate-500">주일
            <input type="date" value={sunday} onChange={(e) => setSunday(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm text-slate-900" />
          </label>
          <label className="text-xs text-slate-500">헌금구분 (고정)
            <select value={typeId} onChange={(e) => { setTypeId(Number(e.target.value)); reset(); }} className="mt-1 w-full rounded border px-2 py-1.5 text-sm text-slate-900">
              {OFFERING_TYPES.map((t) => <option key={t.id} value={t.id}>[{t.fund}] {t.name}</option>)}
            </select>
          </label>
          <div className="text-xs text-slate-500">구분
            <div className="mt-1 flex overflow-hidden rounded border text-sm">
              {(["cash", "online"] as const).map((c) => (
                <button key={c} onClick={() => setChannel(c)} className={`flex-1 py-1.5 ${channel === c ? "bg-slate-800 text-white" : "text-slate-700"}`}>
                  {c === "cash" ? "현금" : "이체"}
                </button>
              ))}
            </div>
          </div>
          <div className="relative text-xs text-slate-500">이름 {type.totalOnly && "(총액만 입력)"}
            <input ref={nameRef} disabled={type.totalOnly} value={query}
              onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { if (suggestions[0]) { setPicked(suggestions[0]); setQuery(suggestions[0].name); } amountRef.current?.focus(); } }}
              placeholder="두 글자 이상 입력" className="mt-1 w-full rounded border px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-100" />
            {suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded border bg-white text-sm text-slate-900 shadow">
                {suggestions.map((m) => (
                  <li key={m.id}><button className="w-full px-2 py-1 text-left hover:bg-slate-100" onClick={() => { setPicked(m); setQuery(m.name); amountRef.current?.focus(); }}>{m.name} {m.title && <span className="text-slate-400">{m.title}</span>}</button></li>
                ))}
              </ul>
            )}
          </div>
          <label className="text-xs text-slate-500">금액 {unit > 1 && `(×${won(unit)}원)`}
            <input ref={amountRef} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && submit()} className="mt-1 w-full rounded border px-2 py-1.5 text-right text-sm text-slate-900" />
          </label>
          <div className="flex items-end gap-2">
            <button onClick={submit} className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white">{editId ? "수정" : "추가"}</button>
            {editId && <button onClick={reset} className="rounded border px-3 py-1.5 text-sm">취소</button>}
          </div>
        </div>
        {type.hasMemo && (
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="내용(기타감사 등)" className="mt-3 w-full rounded border px-2 py-1.5 text-sm" />
        )}
      </div>

      <div className="mb-3 flex items-center justify-between text-sm">
        <div>{sunday} 주일 · {entries.length}건 · 합계 <b>{won(grand)}원</b></div>
        <button disabled className="rounded border px-3 py-1.5 text-slate-400" title="DB 연결 후 사용">입력 완료(저장)</button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {byType.map(({ t, rows, total }) => (
          <div key={t.id} className="rounded-lg border border-slate-200 bg-white">
            <div className="flex justify-between border-b px-4 py-2 text-sm font-semibold"><span>{t.name}</span><span>{won(total)}</span></div>
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-1.5">{r.name}{r.memo && <span className="text-slate-400"> · {r.memo}</span>}</td>
                    <td className="px-2 text-xs text-slate-400">{r.channel === "cash" ? "현금" : "이체"}</td>
                    <td className="px-2 text-right">{won(r.amount)}</td>
                    <td className="w-24 px-2 text-right text-xs">
                      <button onClick={() => edit(r)} className="text-blue-600">수정</button>{" "}
                      <button onClick={() => setEntries((xs) => xs.filter((x) => x.id !== r.id))} className="text-red-500">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}
