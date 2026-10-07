"use client";
import { Fragment, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import PageHeader from "@/components/PageHeader";
import { DEMO_BUDGETS, DEMO_EXPENSES, DEMO_MISSION } from "@/lib/demo";
import { missionLedger, rate, spendingStatus } from "@/lib/officersReport";
import { koreanAmount } from "@/lib/koreanAmount";
import { localDate } from "@/lib/todo";

const won = (n: number) => (n ? n.toLocaleString("ko-KR") : "-");
const TABS = ["지출 현황", "부서별 상세", "요약", "해외선교 현황"] as const;
const th = "border border-slate-300 bg-slate-100 px-2 py-1.5 text-center font-semibold";
const td = "border border-slate-300 px-2 py-1";

export default function OfficersReport() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("지출 현황");
  const [year] = useState(2026);
  const [asOf, setAsOf] = useState(localDate);
  const [from, setFrom] = useState(`${year}-01-01`);
  const rows = useMemo(() => spendingStatus(DEMO_BUDGETS, DEMO_EXPENSES, `${year}-01-01`, asOf), [year, asOf]);
  const total = rows[0];

  const downloadExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("제직회");
    ws.addRow([`${year}년도 지출 현황`]); ws.addRow(["작성일", asOf]); ws.addRow([]);
    ws.addRow(["구 분(부서)", "(항목)", "예 산 액(A)", "지 출 액(B)", "진행율(B/A)", "잔 액"]).font = { bold: true };
    rows.forEach((r) => {
      const name = r.kind === "item" ? [r.firstOfDept ? r.dept : "", r.item] : [r.kind === "total" ? "합 계" : r.dept, "소 계"];
      const row = ws.addRow([...name, r.budget, r.spent, r.budget ? r.spent / r.budget : null, r.budget - r.spent]);
      if (r.kind !== "item") row.font = { bold: true };
    });
    [1, 2].forEach((c) => (ws.getColumn(c).width = 18));
    [3, 4, 6].forEach((c) => (ws.getColumn(c).numFmt = "#,##0;-#,##0;-"));
    ws.getColumn(5).numFmt = "0.00%";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([await wb.xlsx.writeBuffer()]));
    a.download = `재직회보고서_${asOf.replace(/-/g, "").slice(2)}_v1.xlsx`;
    a.click();
  };

  return (
    <>
      <PageHeader actions={<>
        <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">가상 데이터</span>
        <button onClick={downloadExcel} className="no-print rounded border px-3 py-1 text-sm">엑셀 저장</button>
        <button onClick={() => window.print()} className="no-print rounded bg-blue-600 px-3 py-1 text-sm text-white">출력·PDF</button>
      </>} />
      <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <div className="flex overflow-hidden rounded border">
          {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 ${tab === t ? "bg-slate-800 text-white" : ""}`}>{t}</button>)}
        </div>
        {tab === "부서별 상세" && <label>시작일 <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border px-2 py-1" /></label>}
        <label>작성일(기준일) <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="rounded border px-2 py-1" /></label>
        <span className="text-xs text-slate-400">재직회 때 총계원장(&apos;총&apos;)도 함께 배포</span>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm print:border-0 print:p-0">
        {tab === "지출 현황" && (
          <>
            <h2 className="text-center text-lg font-bold">{year}년도 지출 현황</h2>
            <div className="mb-2 text-right text-slate-500">작성일 {asOf}</div>
            <table className="w-full border-collapse">
              <thead><tr><th className={th}>구 분(부서)</th><th className={th}>(항목)</th><th className={th}>예 산 액(A)</th><th className={th}>지 출 액(B)</th><th className={th}>진행율(B/A)</th><th className={th}>잔 액</th></tr></thead>
              <tbody>
                {rows.map((r, i) => r.kind === "item" ? (
                  <tr key={i}>
                    <td className={td}>{r.firstOfDept ? r.dept : ""}</td><td className={td}>{r.item}</td>
                    <td className={`${td} text-right`}>{won(r.budget)}</td><td className={`${td} text-right`}>{won(r.spent)}</td>
                    <td className={`${td} text-right`}>{rate(r.spent, r.budget)}</td>
                    <td className={`${td} text-right ${r.budget - r.spent < 0 ? "text-red-600" : ""}`}>{won(r.budget - r.spent)}</td>
                  </tr>
                ) : (
                  <tr key={i} className={r.kind === "total" ? "bg-blue-50 font-bold" : "bg-slate-50 font-semibold"}>
                    <td className={td} colSpan={2}>{r.kind === "total" ? "합 계" : `${r.dept} 소 계`}</td>
                    <td className={`${td} text-right`}>{won(r.budget)}</td><td className={`${td} text-right`}>{won(r.spent)}</td>
                    <td className={`${td} text-right`}>{rate(r.spent, r.budget)}</td><td className={`${td} text-right`}>{won(r.budget - r.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === "부서별 상세" && (() => {
          const detail = spendingStatus(DEMO_BUDGETS, DEMO_EXPENSES, from, asOf);
          return (
            <>
              <h2 className="mb-4 text-center text-lg font-bold">[재정부] {year}년도 지출 상세 ({from} ~ {asOf})</h2>
              {detail.filter((r) => r.kind === "subtotal").map((d) => (
                <table key={d.dept} className="mb-5 w-full border-collapse">
                  <thead>
                    <tr><th className={`${th} text-left`} colSpan={5}>{d.dept} <span className="font-normal text-slate-500">(부장 [확인 필요])</span></th></tr>
                    <tr><th className={th}></th><th className={th}>예산</th><th className={th}>지출</th><th className={th}>잔액</th><th className={th}>진행률</th></tr>
                    <tr className="font-semibold"><td className={td}>소계</td><td className={`${td} text-right`}>{won(d.budget)}</td><td className={`${td} text-right`}>{won(d.spent)}</td><td className={`${td} text-right`}>{won(d.budget - d.spent)}</td><td className={`${td} text-right`}>{rate(d.spent, d.budget)}</td></tr>
                  </thead>
                  <tbody>
                    {detail.filter((r) => r.kind === "item" && r.dept === d.dept).map((it) => {
                      if (it.kind !== "item") return null;
                      const txs = DEMO_EXPENSES.filter((t) => t.dept === d.dept && t.item === it.item && t.date >= from && t.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
                      let bal = it.budget;
                      return (
                        <Fragment key={it.item}>
                          <tr className="bg-slate-50"><td className={td}>{it.item}</td><td className={`${td} text-right`}>{won(it.budget)}</td><td className={`${td} text-right`}>{won(it.spent)}</td><td className={`${td} text-right`}>{won(it.budget - it.spent)}</td><td className={`${td} text-right`}>{rate(it.spent, it.budget)}</td></tr>
                          {txs.map((t, k) => { bal -= t.amount; return (
                            <tr key={k} className="text-slate-600"><td className={`${td} pl-6`}>{t.date.slice(5)} {t.content}</td><td className={td}></td><td className={`${td} text-right`}>{won(t.amount)}</td><td className={`${td} text-right`}>{won(bal)}</td><td className={td}>{t.memo}</td></tr>
                          ); })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              ))}
            </>
          );
        })()}

        {tab === "요약" && (() => {
          const income = Math.round(total.budget * 0.68); // [확인 필요] 수입 실적은 DB 연결 후 수입 테이블에서 계산
          return (
            <div className="mx-auto max-w-2xl space-y-4 leading-7">
              <h2 className="text-center text-lg font-bold">{year}년도 재정 보고(요약) <span className="text-sm font-normal text-slate-500">작성일 : {asOf}</span></h2>
              <section>
                <h3 className="font-semibold">1. {year}년도 수입/지출 (연예산 {won(total.budget)} 기준)</h3>
                <p>수입은 {won(income)} ({koreanAmount(income)}) {rate(income, total.budget)} 수입되었습니다.</p>
                <p>지출은 {won(total.spent)} ({koreanAmount(total.spent)}) {rate(total.spent, total.budget)} 지출되었습니다.</p>
              </section>
              <section><h3 className="font-semibold">2. {year - 1}년도 대비</h3><p className="text-slate-500">전년도 데이터 이관 후 표시 [확인 필요]</p></section>
              <section><h3 className="font-semibold">3. 결론</h3><p>수입 − 지출 = {won(income - total.spent)}원</p></section>
            </div>
          );
        })()}

        {tab === "해외선교 현황" && (() => {
          const { rows: mrows, summary: s } = missionLedger(5000000, DEMO_MISSION.filter((t) => t.date <= asOf), year);
          return (
            <>
              <h2 className="text-center text-lg font-bold">{year}년도 해외선교 현황보고</h2>
              <div className="mb-3 text-right text-slate-500">작성일 : {asOf}</div>
              <table className="mb-5 w-full border-collapse">
                <thead><tr>{[`${String(year - 1).slice(2)}년도 이월금(A)`, "금년도 총 수입(B)", "합계(A+B)(C)", "금년도 총 지출(D)", "현재 잔액(C−D)"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody><tr className="font-semibold">{[s.carry, s.income, s.sum, s.expense, s.balance].map((v, i) => <td key={i} className={`${td} text-right`}>{won(v)}</td>)}</tr></tbody>
              </table>
              <div className="mb-1 font-semibold">◆ 상세내역</div>
              <table className="w-full border-collapse">
                <thead><tr>{["일자", "내 용", "수입", "지출", "잔액"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {mrows.map((r, i) => r.kind === "month" ? (
                    <tr key={i} className="bg-slate-50 font-semibold"><td className={td} colSpan={2}>{r.month}월 합계</td><td className={`${td} text-right`}>{won(r.income)}</td><td className={`${td} text-right`}>{won(r.expense)}</td><td className={td}></td></tr>
                  ) : (
                    <tr key={i}><td className={td}>{r.date.slice(5)}</td><td className={td}>{r.content}</td><td className={`${td} text-right`}>{won(r.income)}</td><td className={`${td} text-right`}>{won(r.expense)}</td><td className={`${td} text-right`}>{won(r.balance)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          );
        })()}
      </div>
    </>
  );
}
