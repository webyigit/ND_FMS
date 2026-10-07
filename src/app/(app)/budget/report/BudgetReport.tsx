"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import YearSelect from "@/components/ui/YearSelect";
import { ExcelButton, PrintButton, card } from "@/components/ui/Buttons";
import { useDbQuery } from "@/lib/db/useDb";
import { downloadXlsx } from "@/lib/excel";
import { fileName, localDate, thisYear, won } from "@/lib/format";
import { wonOrDash } from "@/lib/reports/common";
import { loadSettlement, rate, td, tdr, th, type Settlement } from "../shared";

type Line = { label: string; budget: number; actual: number; next: number; strong?: boolean };

/** 결산 + 다음 연도 예산을 한 줄씩 맞춘다 */
function lines(d: Settlement) {
  const nextType = new Map(d.nextIncome.rows.map((r) => [r.type, r.budget]));
  const nextDept = new Map(d.nextExpense.depts.map((g) => [g.dept, g.budget]));
  const income: Line[] = [
    ...d.income.rows.filter((r) => r.fund !== "별도").map((r) => ({ label: r.type, budget: r.budget, actual: r.actual, next: nextType.get(r.type) ?? 0 })),
    ...d.nextIncome.rows.filter((r) => r.fund !== "별도" && !d.income.rows.some((x) => x.type === r.type)).map((r) => ({ label: r.type, budget: 0, actual: 0, next: r.budget })),
  ];
  const expense: Line[] = d.expense.depts.filter((g) => g.fund !== "별도")
    .map((g) => ({ label: g.dept, budget: g.budget, actual: g.actual, next: nextDept.get(g.dept) ?? 0 }))
    .filter((l) => l.budget || l.actual || l.next);
  const sep = (xs: { fund: string; budget: number }[]) => xs.filter((x) => x.fund === "별도").reduce((s, x) => s + x.budget, 0);
  const inc: Line = { label: "수입(일반·특별)", budget: d.income.operating.budget, actual: d.income.operating.actual, next: d.nextIncome.operating.budget, strong: true };
  const exp: Line = { label: "지출(일반·특별)", budget: d.expense.operating.budget, actual: d.expense.operating.actual, next: d.nextExpense.operating.budget, strong: true };
  const summary: Line[] = [inc, exp, { label: "수지차", budget: inc.budget - exp.budget, actual: inc.actual - exp.actual, next: inc.next - exp.next, strong: true },
    { label: "별도 기금 수입", budget: d.income.funds.find((f) => f.fund === "별도")?.budget ?? 0, actual: d.income.funds.find((f) => f.fund === "별도")?.actual ?? 0, next: sep(d.nextIncome.rows) },
    { label: "별도 기금 지출", budget: d.expense.separate.budget, actual: d.expense.separate.actual, next: d.nextExpense.separate.budget }];
  return { income, expense, summary };
}

function Table({ head, first, rows, total }: { head: string[]; first: string; rows: Line[]; total?: Line }) {
  return (
    <table className="w-full border-collapse">
      <thead><tr><th className={th}>{first}</th>{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
      <tbody>
        {[...rows, ...(total ? [total] : [])].map((l) => (
          <tr key={l.label} className={l.strong ? "bg-surface-2 font-semibold" : ""}>
            <td className={td}>{l.label}</td><td className={tdr}>{wonOrDash(l.budget)}</td><td className={tdr}>{wonOrDash(l.actual)}</td>
            <td className={tdr}>{rate(l.actual, l.budget)}</td><td className={tdr}>{wonOrDash(l.next)}</td>
            <td className={`${tdr} ${l.next - l.budget < 0 ? "text-danger" : ""}`}>{l.next - l.budget ? won(l.next - l.budget) : "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function BudgetReport() {
  return <DbOnly what="예결산 리포트"><Body /></DbOnly>;
}

function Body() {
  const [year, setYear] = useState(thisYear());
  const q = useDbQuery((s) => loadSettlement(s, year, true), [year]);
  const L = useMemo(() => (q.data ? lines(q.data) : null), [q.data]);
  const head = [`${year} 예산(A)`, `${year} 결산(B)`, "B/A", `${year + 1} 예산(C)`, "C−A"];
  const row = (l: Line) => [l.label, l.budget, l.actual, rate(l.actual, l.budget), l.next, l.next - l.budget];

  const excel = () => q.data && L && downloadXlsx(fileName(`예결산리포트_${year}`, "xlsx"), [
    { name: "총괄", widths: [18, 16, 16, 10, 16, 16], rows: [["구분", ...head], ...L.summary.map(row)] },
    { name: "기금별 이월", widths: [12, 16, 16, 16, 16, 18], rows: [["기금", `${year - 1}년 이월`, "수입", "지출", "회계 간 대체", `${year + 1}년 이월`],
      ...q.data.funds.map((f) => [f.name, f.carry, f.income, f.expense, f.transferIn - f.transferOut, f.next])] },
    { name: "수입", widths: [18, 16, 16, 10, 16, 16], rows: [["헌금구분", ...head], ...L.income.map(row), row(L.summary[0])] },
    { name: "지출", widths: [18, 16, 16, 10, 16, 16], rows: [["부서", ...head], ...L.expense.map(row), row(L.summary[1])] },
  ]);


  return (
    <>
      <PageHeader actions={<><ExcelButton onClick={excel} disabled={!q.data} /><PrintButton /></>} />
      <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3 text-sm shadow-card">
        <YearSelect value={year} onChange={setYear} />
        <span className="text-xs text-muted">{year}년 결산과 {year + 1}년 예산을 한 장에 정리해요(A4 출력)</span>
      </div>
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      {q.loading && <div className="text-sm text-muted">불러오는 중…</div>}
      {q.data && L && (
        <div className={`${card} mx-auto max-w-[210mm] space-y-5 p-6 text-sm print:max-w-none print:p-0`}>
          <div>
            <h2 className="text-center text-lg font-bold">{year}년도 결산 및 {year + 1}년도 예산</h2>
            <div className="text-right text-label">작성일 {localDate()}{q.data.closedAt ? ` · 결산 확정 ${q.data.closedAt.slice(0, 10)}` : " · 결산 미확정"}</div>
          </div>
          <section><h3 className="mb-2 font-semibold">1. 총괄</h3><Table head={head} first="구분" rows={L.summary} /></section>
          <section>
            <h3 className="mb-2 font-semibold">2. 기금별 이월</h3>
            <table className="w-full border-collapse">
              <thead><tr>{["기금", `${year - 1}년 이월`, "수입", "지출", "대체", `${year + 1}년 이월`].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>{q.data.funds.map((f) => (
                <tr key={f.fundId}><td className={td}>{f.name}</td>{[f.carry, f.income, f.expense, f.transferIn - f.transferOut].map((v, i) => <td key={i} className={tdr}>{wonOrDash(v)}</td>)}<td className={`${tdr} font-semibold`}>{won(f.next)}</td></tr>
              ))}</tbody>
            </table>
          </section>
          <section className="break-inside-avoid"><h3 className="mb-2 font-semibold">3. 수입 (헌금구분별)</h3><Table head={head} first="헌금구분" rows={L.income} total={L.summary[0]} /></section>
          <section className="break-inside-avoid"><h3 className="mb-2 font-semibold">4. 지출 (부서별)</h3><Table head={head} first="부서" rows={L.expense} total={L.summary[1]} /></section>
          <p className="text-xs text-muted">결산 = 그 해 주일 기준 수입·지출 합계. 별도 기금(해외선교·네팔)은 총괄 아래 따로 적었어요.</p>
        </div>
      )}
    </>
  );
}
