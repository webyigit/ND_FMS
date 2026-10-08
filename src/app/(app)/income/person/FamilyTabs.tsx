"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import Notice from "@/components/ui/Notice";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { supabaseBrowser } from "@/lib/supabase/client";
import { must } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { won } from "@/lib/format";
import { coreName, defaultHead, familyCandidates, mergePlan, sumCandidates, type Candidate, type FamilyMember } from "@/lib/income/family";
import { MONTHS, filterByName, typeMonthMatrix, type PersonAggRow, type PersonTotal } from "@/lib/income/report";
import { amt, td, tdNum, th } from "../_ui/sheet";

type Type = { id: number; name: string };

/** 한 사람 고르기: 이름으로 찾아서 누른다 */
export function PickPerson({ persons, onPick, placeholder = "이름으로 찾기" }: { persons: PersonTotal[]; onPick: (p: PersonTotal) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => (q.trim() ? filterByName(persons, q).slice(0, 12) : []), [persons, q]);
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={`${input} w-56`} />
      {hits.length > 0 && (
        <ul className="absolute z-10 mt-1 w-72 rounded border bg-surface text-sm shadow">
          {hits.map((p) => (
            <li key={p.key}><button onClick={() => { onPick(p); setQ(""); }} className="flex w-full justify-between px-2 py-1 text-left hover:bg-surface-2">
              <span>{p.name}{p.memberId == null && <span className="ml-1 text-[11px] text-muted">미등록</span>}{p.householdLabel && <span className="ml-1 text-xs text-muted">· {p.householdLabel}</span>}</span>
              <span className="text-xs text-label">{won(p.total)}</span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 개인별: 1명 기준 헌금구분 × 월 */
export function PersonTab({ year, base, persons, rows, onPick, onFamily }: {
  year: number; base: PersonTotal | null; persons: PersonTotal[]; rows: PersonAggRow[]; onPick: (p: PersonTotal) => void; onFamily: () => void;
}) {
  const matrix = useMemo(() => (base ? typeMonthMatrix(rows.filter((r) => (r.member_id != null ? `m${r.member_id}` : `l${r.payer_label ?? ""}`) === base.key)) : null), [base, rows]);
  return (
    <div className={`${card} p-4 text-sm`}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <PickPerson persons={persons} onPick={onPick} />
        {base && <>
          <b className="text-heading">{base.name}</b>
          {base.householdLabel && <span className="text-xs text-muted">가족: {base.householdLabel}</span>}
          <span className="text-label">{year}년 합계 {won(base.total)}원 · {base.n}건</span>
          <button onClick={onFamily} className={`${btn} no-print ml-auto`}>이 이름으로 가족단위 보기</button>
        </>}
      </div>
      {!base ? <p className="py-6 text-center text-muted">이름을 찾아 한 사람을 고르세요.</p> : matrix && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead><tr><th className={th}>헌금구분</th>{MONTHS.map((m) => <th key={m} className={th}>{m}</th>)}<th className={th}>합계</th></tr></thead>
            <tbody>
              {matrix.types.map((t) => <tr key={t.id}><td className={td}>{t.name}</td>{t.months.map((v, i) => <td key={i} className={tdNum}>{amt(v)}</td>)}<td className={`${tdNum} font-semibold`}>{amt(t.total)}</td></tr>)}
              <tr className="bg-surface-2 font-semibold"><td className={td}>합계</td>{matrix.monthTotals.map((v, i) => <td key={i} className={tdNum}>{amt(v)}</td>)}<td className={tdNum}>{amt(matrix.total)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** 가족단위: 기준 이름을 포함한 헌금명단에서 골라 가족으로 합치기·분리 */
export function FamilyTab({ year, base, persons, members, types, onPick, onChanged }: {
  year: number; base: PersonTotal | null; persons: PersonTotal[]; members: FamilyMember[]; types: Type[];
  onPick: (p: PersonTotal) => void; onChanged: () => void;
}) {
  const sb = supabaseBrowser()!;
  const [extra, setExtra] = useState<number[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [head, setHead] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; headId?: number } | null>(null);
  const [q, setQ] = useState("");

  const list = useMemo(() => (base ? familyCandidates(base, persons, members, extra) : []), [base, persons, members, extra]);
  const picked = list.filter((c) => sel.has(c.key));
  const headId = head != null && picked.some((c) => c.memberId === head) ? head : defaultHead(picked, base?.key ?? "");
  const shownTypes = types.filter((t) => list.some((c) => c.byType[t.id]));
  const found = useMemo(() => {
    const k = coreName(q);
    return k ? members.filter((m) => coreName(m.full_name).includes(k) && !list.some((c) => c.memberId === m.id)).slice(0, 8) : [];
  }, [q, members, list]);

  const reset = () => { setSel(new Set()); setHead(null); };
  const pick = (p: PersonTotal) => { onPick(p); setExtra([]); reset(); setMsg(null); };
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const merge = async () => {
    if (headId == null) return;
    const ids = mergePlan(picked, headId);
    const headC = picked.find((c) => c.memberId === headId)!;
    if (!ids.length && headC.isHead) { setMsg({ ok: true, text: "이미 한 가족이에요." }); return; }
    if (!confirm(`${picked.map((c) => c.name).join(", ")} 님을 한 가족으로 합칠까요?\n세대주(영수증 발행 당사자): ${headC.name}\n헌금 원본 기록은 바뀌지 않고, 나중에 분리할 수 있어요.`)) return;
    setBusy(true); setMsg(null);
    try {
      for (const id of ids) must(await sb.rpc("join_family", { p_member: id, p_with: headId }));
      if (!headC.isHead) must(await sb.rpc("set_household_head", { p_member: headId }));
      setMsg({ ok: true, text: `${picked.length}명을 한 가족으로 합쳤어요. 합계 ${won(sumCandidates(picked))}원 (${year}년).`, headId });
      reset(); onChanged();
    } catch (e) {
      setMsg({ ok: false, text: `합치지 못했어요: ${dbError(e)} (중간까지 합쳐졌을 수 있어요. 목록을 확인해 주세요.)` }); onChanged();
    } finally { setBusy(false); }
  };
  const split = async (c: Candidate) => {
    if (c.memberId == null || !confirm(`${c.name} 님을 '${c.householdLabel ?? "가족"}'에서 분리할까요?${c.isHead ? "\n세대주라서, 남은 가족의 세대주를 다시 정해야 해요." : ""}`)) return;
    setBusy(true); setMsg(null);
    try {
      must(await sb.rpc("leave_family", { p_member: c.memberId }));
      setMsg({ ok: true, text: `${c.name} 님을 가족에서 분리했어요.` }); reset(); onChanged();
    } catch (e) { setMsg({ ok: false, text: `분리하지 못했어요: ${dbError(e)}` }); } finally { setBusy(false); }
  };

  return (
    <div className={`${card} p-4 text-sm`}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <PickPerson persons={persons} onPick={pick} placeholder="기준이 될 1명 찾기" />
        {base && <span className="text-label"><b className="text-heading">{base.name}</b> 이름을 포함한 헌금명단 · 같은 가족</span>}
      </div>
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}{msg.ok && msg.headId && <> <Link href={`/receipt/issue?member=${msg.headId}&year=${year}`} className="ml-2 underline">기부금영수증 발행하기</Link></>}</Notice>}
      {!base ? <p className="py-6 text-center text-muted">기준이 될 사람을 고르면, 그 이름이 들어간 헌금명단과 지금 묶인 가족을 보여 줘요.</p> : <>
        {picked.length > 0 && (
          <div className="no-print sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-primary-subtle px-4 py-2">
            <b>선택 {picked.length}명 합계 {won(sumCandidates(picked))}원</b>
            <label className="text-xs text-label">세대주(발행 당사자)
              <select value={headId ?? ""} onChange={(e) => setHead(Number(e.target.value))} className={`${input} ml-1 py-0.5`}>
                {picked.filter((c) => c.memberId != null).map((c) => <option key={c.key} value={c.memberId!}>{c.name}</option>)}
              </select>
            </label>
            <button disabled={busy || headId == null || picked.filter((c) => c.memberId != null).length < 2} onClick={merge} className={btnPrimary}>가족으로 합치기</button>
            <button onClick={reset} className={`${btn} ml-auto`}>선택 해제</button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr>
              <th className={`${th} no-print w-8`} />
              <th className={th}>이름</th><th className={th}>직분</th><th className={th}>지금 가족</th><th className={th}>찾은 이유</th>
              {shownTypes.map((t) => <th key={t.id} className={th}>{t.name}</th>)}
              <th className={th}>{year}년 합계</th><th className={`${th} no-print`} />
            </tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.key} className={sel.has(c.key) ? "bg-primary-subtle/50" : ""}>
                  <td className={`${td} no-print text-center`}>
                    <input type="checkbox" checked={sel.has(c.key)} disabled={c.memberId == null} title={c.memberId == null ? "교인에 연결된 이름만 합칠 수 있어요" : ""} onChange={() => toggle(c.key)} />
                  </td>
                  <td className={td}>{c.name}{c.memberId == null && <span className="ml-1 text-[11px] text-muted">미등록</span>}</td>
                  <td className={td}>{c.title}</td>
                  <td className={td}>{c.householdLabel}{c.isHead && <span className="ml-1 rounded bg-info-subtle px-1 text-xs text-info">세대주</span>}</td>
                  <td className={`${td} text-xs text-muted`}>{c.why}</td>
                  {shownTypes.map((t) => <td key={t.id} className={tdNum}>{amt(c.byType[t.id])}</td>)}
                  <td className={`${tdNum} font-semibold`}>{amt(c.total)}</td>
                  <td className={`${td} no-print text-center`}>{c.householdId != null && <button disabled={busy} onClick={() => split(c)} className="text-xs text-danger">분리</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td className={`${td} no-print`} /><td className={td} colSpan={4}>목록 합계</td>
                {shownTypes.map((t) => <td key={t.id} className={tdNum}>{amt(list.reduce((s, c) => s + (c.byType[t.id] ?? 0), 0))}</td>)}
                <td className={tdNum}>{amt(sumCandidates(list))}</td><td className={`${td} no-print`} />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="no-print relative mt-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름이 다른 가족 추가 (예: 배우자)" className={`${input} w-64`} />
          {found.length > 0 && (
            <ul className="absolute z-10 mt-1 w-72 rounded border bg-surface shadow">
              {found.map((m) => (
                <li key={m.id}><button onClick={() => { setExtra((x) => [...x, m.id]); setQ(""); }} className="w-full px-2 py-1 text-left hover:bg-surface-2">
                  {m.full_name} <span className="text-xs text-muted">{m.title} {m.household_label && `· ${m.household_label}`}</span>
                </button></li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">합치면 교인 정보의 가족(세대)만 바뀌고 헌금 원본 기록은 그대로예요. 기부금영수증은 세대주 이름으로 가족 합계가 잡혀요. 분리하면 원래대로 따로 계산돼요.</p>
      </>}
    </div>
  );
}
