"use client";
import { Fragment, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import TitleEditor from "@/components/ui/TitleEditor";
import { PrintButton, btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { saveTitles } from "@/lib/expense/db";
import { isSunday, koDate, sundayOf } from "@/lib/expense/week";
import { localDate, won } from "@/lib/format";
import { LEDGER_TITLES, LEDGER_TITLE_KEY, ledger, type Ledger as L, type SpecialRow } from "@/lib/ledger/general";
import { loadLedgerInput, saveTypeCarry } from "@/lib/ledger/load";
import { supabaseBrowser } from "@/lib/supabase/client";
import { workSunday } from "@/lib/weekly/steps";
import { markStep } from "@/lib/weekly/stepsDb";

// 총계원장: 참고시트 '총' 시트(수입 지출 보고서, 당회 재정보고용) 구조 그대로. A4 세로 1장, 올해 1/1~기준 주일 누계.
const th = "border border-line bg-surface-2 px-2 py-1 text-center font-semibold";
const td = "border border-line px-2 py-1";
const num = `${td} text-right whitespace-nowrap`;
const H = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1 mt-5 font-bold text-heading">■ {children}</h3>;
const pct = (r: number | null) => (r == null ? "-" : `${r.toFixed(2)}%`);
const signed = (n: number) => (n < 0 ? `-${won(-n)}` : won(n));

export default function Ledger() {
  return <DbOnly what="총계원장"><Screen /></DbOnly>;
}

function Screen() {
  const [sunday, setSunday] = useState(workSunday);
  const q = useDbQuery((sb) => loadLedgerInput(sb, sunday), [sunday]);
  const d = q.data?.sunday === sunday ? q.data : null;
  const l = useMemo(() => (d ? ledger(d) : null), [d]);
  const titles = d?.titles ?? LEDGER_TITLES;
  const pick = (v: string) => { if (v) setSunday(isSunday(v) ? v : sundayOf(v)); };

  return (
    <>
      <PageHeader printHidden actions={<PrintButton onPrint={() => void markStep(sunday, "ledger")} />} />
      <div className={`${card} no-print mb-4 flex flex-wrap items-end gap-3 p-4 text-sm`}>
        <label className="text-xs text-label">기준 주일(올해 1월 1일부터 이 주일까지 누계)
          <input type="date" value={sunday} onChange={(e) => pick(e.target.value)} className={`${input} mt-1 block`} />
        </label>
        {sunday !== workSunday() && <button className={btn} onClick={() => setSunday(workSunday())}>이번 주로</button>}
        {d && <TitleEditor key={titles.join("|")} titles={titles} onSave={(xs) => saveTitles(supabaseBrowser()!, xs, LEDGER_TITLE_KEY)} onSaved={q.reload} />}
      </div>
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      {q.loading && !d && <div className="text-sm text-muted">불러오는 중…</div>}
      {d && l && <TypeCarryEditor year={d.year} rows={l.special.rows} types={d.types.filter((t) => t.fund === "특별" && (t.parentId == null))} fundCarry={d.carry.특별} onSaved={q.reload} />}
      {d && l && <Sheet l={l} churchName={d.churchName} titles={titles} />}
      <p className="no-print mt-3 text-xs text-muted">
        수입 묶음(일반헌금·절기헌금·기타헌금)은 헌금구분 이름으로 나눠요 [확인 필요]. 특별헌금 지출은 항목·부서 이름으로 구분 줄을 찾고, 못 찾으면 &lsquo;기타&rsquo;로 보여요 [확인 필요].
        지출에는 송금 수수료를 넣었어요(금주 보고서와 같음). 회계 간 대체는 잔액에 넣고 비고에 적어요.
      </p>
    </>
  );
}

function Sheet({ l, churchName, titles }: { l: L; churchName: string; titles: string[] }) {
  const { summary, general, special, loans, separate } = l;
  const rows = Math.max(general.income.rows.length, general.expense.rows.length);
  const sumCell = (r: typeof summary.total, bold = false) => (
    <>
      <td className={num}>{signed(r.budget)}</td><td className={num}>{signed(r.carry)}</td><td className={num}>{signed(r.income)}</td>
      <td className={`${num} ${bold ? "font-semibold" : ""}`}>{signed(r.total)}</td><td className={num}>{signed(r.expense)}</td>
      <td className={`${num} font-semibold ${r.balance < 0 ? "text-danger" : ""}`}>{signed(r.balance)}</td>
      <td className={`${td} text-xs`}>{r.transfer ? `대체 ${r.transfer > 0 ? "+" : ""}${signed(r.transfer)}` : ""}</td>
    </>
  );
  return (
    <div className="sheet-scroll"><div className={`${card} sheet mx-auto max-w-[210mm] p-6 text-[12px] print:max-w-none print:p-0`}>
      <div className="relative mb-2 bg-surface-2 py-3 text-center text-xl font-bold tracking-[0.3em] text-heading print:bg-transparent">수입 지출 보고서
        <span className="absolute right-2 top-1 text-[11px] font-normal tracking-normal text-label">당회 재정보고용</span></div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div className="font-bold">대한예수교장로회 {churchName} 재정부</div>
        <div className="text-label">작성일 : {localDate()} · {koDate(l.sunday)} 주일까지</div>
      </div>

      <table className="tbl-cards w-full border-collapse">
        <thead><tr>{["구 분", `${l.year}년예산`, "전년이월", `${l.year}년헌금`, "헌금총합계", "지 출", "잔 액", "비 고"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>
          {summary.rows.map((r) => <tr key={r.label}><td className={`${td} text-center font-semibold`}>{r.label}</td>{sumCell(r)}</tr>)}
          <tr className="bg-surface-2 font-semibold"><td className={`${td} text-center`}>{summary.total.label}</td>{sumCell(summary.total, true)}</tr>
        </tbody>
      </table>

      <H>일반헌금</H>
      <div className="tbl-scroll overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr><th className={th} colSpan={2}>수 입</th><th className={th}>예 산</th><th className={th}>수 입</th><th className={th}>비 율</th>
              <th className={`${th} w-2 border-0 bg-transparent`} />
              <th className={th}>지 출</th><th className={th}>예 산</th><th className={th}>지 출</th><th className={th}>비 율</th></tr>
            <tr className="bg-primary-subtle/60 font-semibold">
              <td className={`${td} text-center`} colSpan={2}>합 계</td><td className={num}>{won(general.income.total.budget)}</td><td className={num}>{won(general.income.total.actual)}</td><td className={num}>{pct(general.income.total.rate)}</td>
              <td className="border-0" />
              <td className={`${td} text-center`}>합 계</td><td className={num}>{won(general.expense.total.budget)}</td><td className={num}>{won(general.expense.total.actual)}</td><td className={num}>{pct(general.expense.total.rate)}</td>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => {
              const a = general.income.rows[i], b = general.expense.rows[i];
              const first = a && (i === 0 || general.income.rows[i - 1].group !== a.group);
              const span = a ? general.income.rows.filter((r) => r.group === a.group).length : 0;
              return (
                <tr key={i}>
                  {a ? (
                    <>
                      {first && <td className={`${td} text-center align-middle`} rowSpan={span}>{a.group}</td>}
                      <td className={td}>{a.name}</td><td className={num}>{won(a.budget)}</td><td className={num}>{won(a.actual)}</td><td className={num}>{pct(a.rate)}</td>
                    </>
                  ) : <td className="border-0" colSpan={4} />}
                  <td className="border-0" />
                  {b ? (
                    <><td className={td}>{b.name}</td><td className={num}>{won(b.budget)}</td><td className={num}>{won(b.actual)}</td><td className={num}>{pct(b.rate)}</td></>
                  ) : <td className="border-0" colSpan={4} />}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <H>특별헌금</H>
      <table className="tbl-cards w-full border-collapse">
        <thead><tr>{["구 분", "전년이월", "수 입", "지 출", "잔 액"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>
          <SpRow r={special.total} bold />
          {special.rows.map((r) => <SpRow key={r.name} r={r} />)}
        </tbody>
      </table>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <H>차입현황</H>
          <table className="tbl-cards w-full border-collapse">
            <thead><tr>{loans.rows.map((x, i) => <th key={i} className={th}>{x.lender}</th>)}<th className={th}>합 계</th></tr></thead>
            <tbody><tr>{loans.rows.map((x, i) => <td key={i} className={num}>{won(x.principal)}</td>)}<td className={`${num} font-semibold`}>{won(loans.total)}</td></tr></tbody>
          </table>
        </div>
        <div>
          <H>{separate.name}</H>
          <table className="tbl-cards w-full border-collapse">
            <thead><tr>{["전년이월 (A)", "수입 (B)", "지출 (C)", "잔액 (A+B-C)"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody><tr><td className={num}>{signed(separate.carry)}</td><td className={num}>{won(separate.income)}</td><td className={num}>{won(separate.expense)}</td><td className={`${num} font-semibold`}>{signed(separate.balance)}</td></tr></tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-x-6 gap-y-2 text-[12px]">
        {titles.map((t) => <span key={t} className="flex items-end gap-2"><b>{t}</b><span className="inline-block w-20 border-b border-line">&nbsp;</span>(인)</span>)}
      </div>
      <table className="mt-4 w-full border-collapse text-[12px]">
        <tbody>
          <tr>
            <td className={`${td} w-32 bg-surface-2 text-center text-[13px] font-bold`} rowSpan={2}>{l.year}년도 감사위원회</td>
            <td className={`${td} w-16 text-center`}>위원장</td><td className={td}>&nbsp;</td>
            <td className={`${td} w-16 text-center`}>감사일</td><td className={td}>&nbsp;</td>
          </tr>
          <tr><td className={`${td} text-center`}>위 원</td><td className={td} colSpan={3}>&nbsp;</td></tr>
        </tbody>
      </table>
    </div></div>
  );
}

function SpRow({ r, bold }: { r: SpecialRow; bold?: boolean }) {
  return (
    <tr className={bold ? "bg-surface-2 font-semibold" : ""}>
      <td className={`${td} text-center`}>{r.name}</td><td className={num}>{signed(r.carry)}</td><td className={num}>{won(r.income)}</td><td className={num}>{won(r.expense)}</td>
      <td className={`${num} ${r.balance < 0 ? "text-danger" : ""}`}>{signed(r.balance)}</td>
    </tr>
  );
}

/** 특별헌금 구분별 전년이월: 이월금은 기금 단위로만 있어 구분별 값은 여기서 넣는다. 합이 기금 이월금과 다르면 알려준다 */
function TypeCarryEditor({ year, rows, types, fundCarry, onSaved }: { year: number; rows: SpecialRow[]; types: { id: number; name: string }[]; fundCarry: number; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const cur = (t: { id: number; name: string }) => vals[t.id] ?? String(rows.find((r) => r.name === t.name)?.carry ?? 0);
  const total = types.reduce((s, t) => s + (Number(cur(t).replace(/[^\d-]/g, "")) || 0), 0);
  const mismatch = total !== fundCarry;
  const save = async () => {
    const sb = supabaseBrowser(); if (!sb) return;
    setBusy(true); setErr("");
    try { await saveTypeCarry(sb, year, types.map((t) => ({ offeringTypeId: t.id, amount: Number(cur(t).replace(/[^\d-]/g, "")) || 0 }))); setOpen(false); onSaved(); }
    catch (e) { setErr(dbError(e)); } finally { setBusy(false); }
  };
  if (!open) return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-2 text-xs">
      <button className={btn} onClick={() => setOpen(true)}>특별헌금 구분별 전년이월 입력</button>
      {mismatch && <span className="text-warning">구분별 이월 합계 {won(total)}원이 특별 기금 이월금 {won(fundCarry)}원과 달라요.</span>}
    </div>
  );
  return (
    <div className={`${card} no-print mb-3 flex flex-wrap items-end gap-2 p-3 text-xs`}>
      {types.map((t) => (
        <label key={t.id} className="text-label">{t.name}<input className={`${input} mt-1 block w-32 text-right`} inputMode="numeric" value={cur(t)} onChange={(e) => setVals({ ...vals, [t.id]: e.target.value })} /></label>
      ))}
      <span className={mismatch ? "text-warning" : "text-success"}>합계 {won(total)}원 / 특별 기금 이월금 {won(fundCarry)}원</span>
      <button className={btnPrimary} disabled={busy} onClick={save}>저장</button>
      <button className={btn} onClick={() => { setOpen(false); setVals({}); setErr(""); }}>취소</button>
      {err && <span className="text-danger">{err}</span>}
    </div>
  );
}
