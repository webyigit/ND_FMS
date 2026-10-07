"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import YearSelect from "@/components/ui/YearSelect";
import { ExcelButton, PrintButton, btnPrimary, card, input } from "@/components/ui/Buttons";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { downloadXlsx } from "@/lib/excel";
import { fileName, thisYear, toAmount, won } from "@/lib/format";
import { sum, wonOrDash } from "@/lib/reports/common";
import { missionMonths, missionWeeks } from "@/lib/reports/mission";
import { loadCarry, loadExpWeeks, loadFunds, loadIncWeeks, saveCarry, separateCarry } from "@/lib/reports/load";

const th = "border border-line bg-surface-2 px-2 py-1.5 text-center font-semibold";
const td = "border border-line px-2 py-1 text-right";

async function load(sb: SupabaseClient, year: number) {
  const [inc, exp, funds, carry] = await Promise.all([loadIncWeeks(sb, year, year), loadExpWeeks(sb, year, year), loadFunds(sb), loadCarry(sb, year)]);
  const sep = funds.filter((f) => f.kind === "separate");
  return { inc, exp, sepFunds: sep, carry: separateCarry(funds, carry), carryOf: carry };
}

export default function Mission() {
  return <DbOnly what="해외선교"><Body /></DbOnly>;
}

function Body() {
  const sb = supabaseBrowser();
  const [year, setYear] = useState(thisYear());
  const q = useDbQuery((s) => load(s, year), [year]);
  const [carryInput, setCarryInput] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const weeks = useMemo(() => (q.data ? missionWeeks(q.data.inc, q.data.exp, year, q.data.carry) : []), [q.data, year]);
  const months = useMemo(() => (q.data ? missionMonths(weeks, q.data.carry) : []), [weeks, q.data]);
  const tot = { income: sum(weeks, (w) => w.income), nepalIncome: sum(weeks, (w) => w.nepalIncome), expense: sum(weeks, (w) => w.expense), nepalExpense: sum(weeks, (w) => w.nepalExpense) };
  const carry = q.data?.carry ?? 0;
  const balance = carry + tot.income + tot.nepalIncome - tot.expense - tot.nepalExpense;

  const saveCarryover = async () => {
    if (!sb || !q.data || carryInput == null) return;
    const fund = q.data.sepFunds[0];
    if (!fund) return setNote({ ok: false, text: "별도 기금이 없어요. 기준정보(seed)를 확인해 주세요." });
    try {
      // 별도 기금이 여러 개면 첫 기금에 넣고 나머지는 그대로 둔다
      const others = q.data.sepFunds.slice(1).reduce((s, f) => s + (q.data!.carryOf.get(f.id) ?? 0), 0);
      await saveCarry(sb, year, fund.id, toAmount(carryInput) - others);
      setNote({ ok: true, text: `${year}년 이월금을 저장했어요.` });
      setCarryInput(null); q.reload();
    } catch (e) { setNote({ ok: false, text: `저장하지 못했어요: ${dbError(e)}` }); }
  };

  const excel = () => downloadXlsx(fileName(`해외선교_${year}`, "xlsx"), [
    { name: "주별", widths: [12, 14, 14, 14, 14, 14], rows: [
      ["주일", "해외선교 수입", "네팔 헌금", "해외선교 지출", "네팔 지출", "잔액"],
      [`${year - 1}년 이월`, null, null, null, null, carry],
      ...weeks.map((w) => [w.sunday, w.income, w.nepalIncome, w.expense, w.nepalExpense, w.balance]),
      ["합계", tot.income, tot.nepalIncome, tot.expense, tot.nepalExpense, balance],
    ] },
    { name: "월별 누적", widths: [8, 14, 14, 14, 14, 14, 14, 14], rows: [
      ["월", "해외선교 수입", "네팔 헌금", "해외선교 지출", "네팔 지출", "누계 수입", "누계 지출", "월말 잔액"],
      ...months.map((m) => [`${m.month}월`, m.income, m.nepalIncome, m.expense, m.nepalExpense, m.cumIncome, m.cumExpense, m.balance]),
    ] },
  ]);

  return (
    <>
      <PageHeader actions={<><ExcelButton onClick={excel} disabled={!q.data} /><PrintButton /></>} />
      <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3 text-sm shadow-card">
        <YearSelect value={year} onChange={(y) => { setYear(y); setCarryInput(null); setNote(null); }} />
        <label className="flex items-center gap-2">{year - 1}년 이월금
          <input className={`${input} w-36 text-right`} inputMode="numeric" value={carryInput ?? won(carry)} onChange={(e) => setCarryInput(e.target.value)} />
        </label>
        <button className={btnPrimary} disabled={carryInput == null} onClick={saveCarryover}>이월금 저장</button>
        <span className="text-xs text-muted">전년 결산을 확정하면 자동으로 들어가요</span>
      </div>
      <Notice kind="warn">
        매주 지출은 <Link href="/expense/entry" className="underline">지출입력</Link> 화면에서 부서 &lsquo;해외선교&rsquo;로 입력하세요. 수입은 <Link href="/income/entry" className="underline">수입입력</Link>의 헌금구분 해외선교·네팔선교로 들어와요.
      </Notice>
      {note && <Notice kind={note.ok ? "ok" : "error"}>{note.text}</Notice>}
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      {q.loading && <div className="text-sm text-muted">불러오는 중…</div>}

      {q.data && (
        <div className={`${card} space-y-6 p-6 text-sm print:p-0`}>
          <h2 className="text-center text-lg font-bold">{year}년 해외선교 현황</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["이월금", carry, ""], ["수입(네팔 포함)", tot.income + tot.nepalIncome, "text-chart-in"], ["지출(네팔 포함)", tot.expense + tot.nepalExpense, "text-chart-out"], ["현재 잔액", balance, balance < 0 ? "text-danger" : ""]].map(([l, v, c]) => (
              <div key={l as string} className="rounded-lg border border-line p-3 text-center"><div className="text-xs text-label">{l}</div><div className={`text-lg font-bold ${c}`}>{won(v as number)}</div></div>
            ))}
          </div>

          <section>
            <h3 className="mb-2 font-semibold">월별 누적</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead><tr>{["월", "해외선교 수입", "네팔 헌금", "해외선교 지출", "네팔 지출", "누계 수입", "누계 지출", "월말 잔액"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>{months.map((m) => (
                  <tr key={m.month}><td className={`${td} text-center`}>{m.month}월</td>
                    {[m.income, m.nepalIncome, m.expense, m.nepalExpense, m.cumIncome, m.cumExpense].map((v, i) => <td key={i} className={td}>{wonOrDash(v)}</td>)}
                    <td className={`${td} font-semibold`}>{won(m.balance)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section className="break-before-page">
            <h3 className="mb-2 font-semibold">주별 수입 / 지출</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead><tr>{["주일", "해외선교 수입", "네팔 헌금", "해외선교 지출", "네팔 지출", "잔액"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  <tr className="bg-surface-2"><td className={`${td} text-center`}>{year - 1}년 이월</td><td className={td} colSpan={4} /><td className={td}>{won(carry)}</td></tr>
                  {weeks.map((w) => (
                    <tr key={w.sunday}><td className={`${td} text-center`}>{w.sunday}</td>
                      {[w.income, w.nepalIncome, w.expense, w.nepalExpense].map((v, i) => <td key={i} className={td}>{wonOrDash(v)}</td>)}
                      <td className={td}>{won(w.balance)}</td></tr>
                  ))}
                  {!weeks.length && <tr><td className={`${td} text-center text-muted`} colSpan={6}>{year}년 해외선교 수입·지출이 없어요.</td></tr>}
                  <tr className="bg-primary-subtle font-bold"><td className={`${td} text-center`}>합계</td>
                    {[tot.income, tot.nepalIncome, tot.expense, tot.nepalExpense].map((v, i) => <td key={i} className={td}>{won(v)}</td>)}<td className={td}>{won(balance)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-muted">네팔: 헌금구분·지출항목 이름에 &lsquo;네팔&rsquo;이 들어간 것 [확인 필요: 네팔 잔액을 따로 관리하는지]</p>
          </section>
        </div>
      )}
    </>
  );
}
