"use client";
import { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import PageHeader from "@/components/PageHeader";
import MonthlyFlowChart from "@/components/charts/MonthlyFlowChart";
import { DEMO_BUDGETS, DEMO_EXPENSES, DEMO_INCOME, DEMO_INCOME_BUDGETS, DEMO_MISSION } from "@/lib/demo";
import { auditPeriods, expenseTable, incomeTable, missionSummary, monthly, pct, type Half } from "@/lib/auditReport";
import { localDate } from "@/lib/todo";

const won = (n: number) => (n ? n.toLocaleString("ko-KR") : "-");
const th = "border border-line bg-surface-2 px-2 py-1.5 text-center font-semibold";
const td = "border border-line px-2 py-1";
const MISSION_CARRY = 5000000; // 전년 이월(가상)
const H1_MONTHS = [1, 2, 3, 4, 5, 6], ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function AuditReport() {
  const today = localDate();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [half, setHalf] = useState<Half>(Number(today.slice(5, 7)) >= 7 ? "H2" : "H1");
  const periods = useMemo(() => auditPeriods(year, half, today), [year, half, today]);
  const inc = useMemo(() => incomeTable(DEMO_INCOME_BUDGETS, DEMO_INCOME, periods), [periods]);
  const exp = useMemo(() => expenseTable(DEMO_BUDGETS, DEMO_EXPENSES, periods), [periods]);
  const flow = useMemo(() => monthly(year, DEMO_INCOME.filter((t) => t.date <= today), DEMO_EXPENSES.filter((t) => t.date <= today)), [year, today]);
  // 올해는 이번 달까지만 그린다
  const lastMonth = year === Number(today.slice(0, 4)) ? Number(today.slice(5, 7)) : 12;
  const chartMonths = useMemo(() => (half === "H1" ? H1_MONTHS : ALL_MONTHS).filter((m) => m <= lastMonth), [half, lastMonth]);
  const h2Range = useMemo<[number, number]>(() => [7, Math.max(7, lastMonth)], [lastMonth]);
  const mission = periods.map((p) => missionSummary(MISSION_CARRY, DEMO_MISSION, p));
  const title = `${year}년 ${half === "H1" ? "상반기" : "하반기"} 재정감사보고서`;
  const partial = auditPeriods(year, half).some((p) => p.to > today); // 기간이 끝나기 전이면 오늘까지만 집계

  // 기간 열: 금액 + 예산 대비(%) 묶음
  const pHead = periods.map((p) => <th key={p.key} className={th} colSpan={2}>{p.label}</th>);
  const pSub = periods.flatMap((p) => [<th key={`${p.key}a`} className={th}>금액</th>, <th key={`${p.key}r`} className={th}>예산 대비</th>]);
  const pCells = (amounts: number[], budget: number) => amounts.flatMap((a, i) => [
    <td key={`a${i}`} className={`${td} text-right`}>{won(a)}</td>, <td key={`r${i}`} className={`${td} text-right text-slate-600`}>{pct(a, budget)}</td>]);

  const downloadExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const head = ["", "연예산", ...periods.flatMap((p) => [p.label, "예산 대비"])];
    const sheet = (name: string, first: string, rows: { label: string; budget: number; amounts: number[]; bold?: boolean }[]) => {
      const ws = wb.addWorksheet(name);
      ws.addRow([title]).font = { bold: true, size: 14 };
      ws.addRow(["작성일", today]); ws.addRow([]);
      ws.addRow([first, ...head.slice(1)]).font = { bold: true };
      rows.forEach((r) => {
        const row = ws.addRow([r.label, r.budget, ...r.amounts.flatMap((a) => [a, r.budget ? a / r.budget : null])]);
        if (r.bold) row.font = { bold: true };
      });
      ws.getColumn(1).width = 20;
      for (let c = 2; c <= head.length; c++) { ws.getColumn(c).width = 16; ws.getColumn(c).numFmt = c > 2 && (c - 2) % 2 === 0 ? "0.0%" : "#,##0;-#,##0;-"; }
    };
    sheet("수입", "헌금구분", [...inc.rows.filter((r) => r.fund !== "별도").map((r) => ({ label: r.type, budget: r.budget, amounts: r.amounts })), { label: inc.general.type, budget: inc.general.budget, amounts: inc.general.amounts, bold: true },
      ...inc.rows.filter((r) => r.fund === "별도").map((r) => ({ label: r.type, budget: r.budget, amounts: r.amounts })), { label: inc.separate.type, budget: inc.separate.budget, amounts: inc.separate.amounts, bold: true }]);
    sheet("지출", "부서", [...exp.rows.map((r) => ({ label: r.dept, budget: r.budget, amounts: r.amounts })), { label: "합 계", budget: exp.total.budget, amounts: exp.total.amounts, bold: true }]);
    const m = wb.addWorksheet("월별·해외선교");
    m.addRow(["월", "수입(일반·특별)", "지출", "수지차"]).font = { bold: true };
    flow.filter((f) => chartMonths.includes(f.month)).forEach((f) => m.addRow([`${f.month}월`, f.income, f.expense, f.income - f.expense]));
    m.addRow([]); m.addRow(["해외선교", "기초 잔액", "수입", "지출", "기말 잔액"]).font = { bold: true };
    periods.forEach((p, i) => m.addRow([p.label, mission[i].start, mission[i].income, mission[i].expense, mission[i].end]));
    [2, 3, 4, 5].forEach((c) => { m.getColumn(c).numFmt = "#,##0;-#,##0;-"; m.getColumn(c).width = 16; });
    m.getColumn(1).width = 16;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([await wb.xlsx.writeBuffer()]));
    a.download = `재정감사보고서_${year}_${half === "H1" ? "상반기" : "하반기"}_${today.replace(/-/g, "").slice(2)}_v1.xlsx`;
    a.click();
  };

  const net = periods.map((_, i) => inc.general.amounts[i] - exp.total.amounts[i]);
  return (
    <>
      <PageHeader actions={<>
        <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">가상 데이터</span>
        <button onClick={downloadExcel} className="no-print rounded border px-3 py-1 text-sm">엑셀 저장</button>
        <button onClick={() => window.print()} className="no-print rounded bg-primary px-3 py-1 text-sm text-white">출력·PDF</button>
      </>} />
      <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-surface shadow-card p-3 text-sm">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded border px-2 py-1.5">
          {[0, 1, 2].map((d) => <option key={d} value={Number(today.slice(0, 4)) - d}>{Number(today.slice(0, 4)) - d}년</option>)}
        </select>
        <div className="flex overflow-hidden rounded border">
          {(["H1", "H2"] as const).map((h) => <button key={h} onClick={() => setHalf(h)} className={`px-3 py-1.5 ${half === h ? "bg-primary text-white" : ""}`}>{h === "H1" ? "상반기 (1~6월)" : "하반기 (7~12월 + 연간)"}</button>)}
        </div>
        {partial && <span className="text-xs text-amber-700">기간이 끝나지 않아 오늘({today})까지 집계했어요</span>}
      </div>

      <div className="space-y-6 rounded-lg bg-surface shadow-card p-6 text-sm print:border-0 print:p-0">
        <div>
          <h2 className="text-center text-lg font-bold">{title}</h2>
          <div className="text-right text-label">작성일 {today}</div>
        </div>

        <section>
          <h3 className="mb-2 font-semibold">1. 수지 요약</h3>
          <div className={`grid gap-3 ${periods.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {periods.map((p, i) => (
              <div key={p.key} className="rounded-lg border border-line p-4">
                <div className="mb-2 text-xs font-semibold text-label">{p.label}</div>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div><dt className="text-xs text-label">수입</dt><dd className="font-bold text-chart-in">{won(inc.general.amounts[i])}</dd></div>
                  <div><dt className="text-xs text-label">지출</dt><dd className="font-bold text-chart-out">{won(exp.total.amounts[i])}</dd></div>
                  <div><dt className="text-xs text-label">수지차</dt><dd className={`font-bold ${net[i] < 0 ? "text-red-600" : ""}`}>{net[i].toLocaleString("ko-KR")}</dd></div>
                </dl>
                <div className="mt-2 text-center text-xs text-label">수입 예산 대비 {pct(inc.general.amounts[i], inc.general.budget)} · 지출 집행률 {pct(exp.total.amounts[i], exp.total.budget)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="break-inside-avoid">
          <h3 className="mb-2 font-semibold">2. 월별 수입·지출 추이</h3>
          <MonthlyFlowChart data={flow} months={chartMonths} highlight={half === "H2" && lastMonth >= 7 ? h2Range : undefined} />
        </section>

        <section>
          <h3 className="mb-2 font-semibold">3. 수입 현황 (헌금구분별)</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead><tr><th className={th} rowSpan={2}>헌금구분</th><th className={th} rowSpan={2}>연예산</th>{pHead}</tr><tr>{pSub}</tr></thead>
              <tbody>
                {inc.rows.filter((r) => r.fund !== "별도").map((r) => <tr key={r.type}><td className={td}>{r.type}{r.fund === "특별" && <span className="ml-1 text-xs text-muted">특별</span>}</td><td className={`${td} text-right`}>{won(r.budget)}</td>{pCells(r.amounts, r.budget)}</tr>)}
                <tr className="bg-primary-subtle font-bold"><td className={td}>{inc.general.type}</td><td className={`${td} text-right`}>{won(inc.general.budget)}</td>{pCells(inc.general.amounts, inc.general.budget)}</tr>
                {inc.rows.filter((r) => r.fund === "별도").map((r) => <tr key={r.type}><td className={td}>{r.type}<span className="ml-1 text-xs text-muted">별도</span></td><td className={`${td} text-right`}>{won(r.budget)}</td>{pCells(r.amounts, r.budget)}</tr>)}
                <tr className="bg-surface-2 font-semibold"><td className={td}>{inc.separate.type}</td><td className={`${td} text-right`}>{won(inc.separate.budget)}</td>{pCells(inc.separate.amounts, inc.separate.budget)}</tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">4. 지출 현황 (부서별)</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead><tr><th className={th} rowSpan={2}>부서</th><th className={th} rowSpan={2}>연예산</th>{pHead}<th className={th} rowSpan={2}>잔액</th></tr><tr>{pSub}</tr></thead>
              <tbody>
                {exp.rows.map((r) => <tr key={r.dept}><td className={td}>{r.dept}</td><td className={`${td} text-right`}>{won(r.budget)}</td>{pCells(r.amounts, r.budget)}<td className={`${td} text-right`}>{won(r.budget - r.amounts[r.amounts.length - 1])}</td></tr>)}
                <tr className="bg-primary-subtle font-bold"><td className={td}>합 계</td><td className={`${td} text-right`}>{won(exp.total.budget)}</td>{pCells(exp.total.amounts, exp.total.budget)}<td className={`${td} text-right`}>{won(exp.total.budget - exp.total.amounts[exp.total.amounts.length - 1])}</td></tr>
              </tbody>
            </table>
          </div>
          {half === "H1" && <p className="mt-1 text-xs text-label">잔액 = 연예산 − 상반기 지출</p>}
          {half === "H2" && <p className="mt-1 text-xs text-label">잔액 = 연예산 − 연간 지출</p>}
        </section>

        <section>
          <h3 className="mb-2 font-semibold">5. 해외선교 (별도기금)</h3>
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>기간</th><th className={th}>기초 잔액</th><th className={th}>수입</th><th className={th}>지출</th><th className={th}>기말 잔액</th></tr></thead>
            <tbody>{periods.map((p, i) => <tr key={p.key}><td className={td}>{p.label}</td>{[mission[i].start, mission[i].income, mission[i].expense, mission[i].end].map((v, k) => <td key={k} className={`${td} text-right`}>{won(v)}</td>)}</tr>)}</tbody>
          </table>
        </section>

        <section className="break-inside-avoid">
          <h3 className="mb-2 font-semibold">6. 감사 의견</h3>
          <div className="h-28 rounded border border-dashed border-line p-3 text-muted print:border-slate-400">감사위원 의견 기재란 [확인 필요: 양식]</div>
          <div className="mt-1 text-right text-xs text-muted">결재·서명란 직함 [확인 필요]</div>
          <table className="mt-1 ml-auto border-collapse text-center">
            <tbody><tr>{["서명", "서명", "서명"].map((r, i) => <td key={i} className="border border-line px-6 py-1 text-xs text-label">{r}</td>)}</tr>
              <tr>{[0, 1, 2].map((i) => <td key={i} className="h-14 border border-line px-6" />)}</tr></tbody>
          </table>
        </section>
      </div>
    </>
  );
}
