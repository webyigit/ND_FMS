"use client";
import { Fragment, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import YearSelect from "@/components/ui/YearSelect";
import { ExcelButton, PrintButton, btnPrimary, card } from "@/components/ui/Buttons";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { downloadXlsx } from "@/lib/excel";
import { fileName, localDate, thisYear, won } from "@/lib/format";
import { wonOrDash } from "@/lib/reports/common";
import { loadSettlement, rate, td, tdr, th, type Settlement as S } from "../shared";

export default function Settlement() {
  return <DbOnly what="당해 결산"><Body /></DbOnly>;
}

function Body() {
  const sb = supabaseBrowser();
  const [year, setYear] = useState(thisYear());
  const q = useDbQuery((s) => loadSettlement(s, year), [year]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const d = q.data;

  const close = async () => {
    if (!sb || !d) return;
    const next = d.funds.map((f) => `${f.name} ${won(f.next)}원`).join(", ");
    if (!confirm(`${year}년 결산을 확정할까요?\n${year + 1}년 이월금이 이렇게 저장돼요: ${next}\n(다시 확정하면 덮어써요)`)) return;
    setBusy(true); setNote(null);
    const { error } = await sb.rpc("close_settlement", { p_year: year });
    setBusy(false);
    if (error) return setNote({ ok: false, text: `확정하지 못했어요: ${dbError(error)}` });
    setNote({ ok: true, text: `${year}년 결산을 확정하고 ${year + 1}년 이월금을 저장했어요.` });
    q.reload();
  };

  const excel = () => d && downloadXlsx(fileName(`당해결산_${year}`, "xlsx"), sheets(d, year));

  return (
    <>
      <PageHeader actions={<><ExcelButton onClick={excel} disabled={!d} /><PrintButton /></>} />
      <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3 text-sm shadow-card">
        <YearSelect value={year} onChange={(y) => { setYear(y); setNote(null); }} />
        {d?.closedAt && <span className="rounded bg-success-subtle px-2 py-1 text-xs text-success">확정됨 {d.closedAt.slice(0, 10)}</span>}
        <button className={btnPrimary} onClick={close} disabled={!d?.isAdmin || busy} title={d?.isAdmin ? "" : "관리자만 확정할 수 있어요"}>
          {d?.closedAt ? "결산 다시 확정" : "결산 확정"}
        </button>
        <span className="text-xs text-muted">확정하면 기금별 차기 이월금이 {year + 1}년 이월금으로 저장돼요(관리자)</span>
      </div>
      {note && <Notice kind={note.ok ? "ok" : "error"}>{note.text}</Notice>}
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      {q.loading && <div className="text-sm text-muted">불러오는 중…</div>}
      {d && <Report d={d} year={year} />}
    </>
  );
}

function Report({ d, year }: { d: S; year: number }) {
  const { income: inc, expense: exp } = d;
  return (
    <div className={`${card} space-y-6 p-6 text-sm print:p-0`}>
      <div>
        <h2 className="text-center text-lg font-bold">{year}년도 결산</h2>
        <div className="text-right text-label">작성일 {localDate()}</div>
      </div>

      <section>
        <h3 className="mb-2 font-semibold">1. 기금별 이월</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">
            <thead><tr>{["기금", `${year - 1}년 이월(A)`, "수입(B)", "지출(C)", "회계 간 대체(D)", `${year + 1}년 이월(A+B−C+D)`].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>{d.funds.map((f) => (
              <tr key={f.fundId}><td className={td}>{f.name}</td>{[f.carry, f.income, f.expense, f.transferIn - f.transferOut].map((v, i) => <td key={i} className={tdr}>{wonOrDash(v)}</td>)}
                <td className={`${tdr} font-semibold ${f.next < 0 ? "text-danger" : ""}`}>{won(f.next)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted">지출 송금 수수료는 넣지 않았어요 [확인 필요]</p>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">2. 수입 (헌금구분별 예산 대비)</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">
            <thead><tr>{["헌금구분", "기금", "예산(A)", "수입(B)", "달성률(B/A)", "차이(B−A)"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {(["일반", "특별", "별도"] as const).map((f) => {
                const rows = inc.rows.filter((r) => r.fund === f), t = inc.funds.find((x) => x.fund === f)!;
                return (
                  <Fragment key={f}>
                    {rows.map((r) => <tr key={r.id}><td className={td}>{r.type}</td><td className={`${td} text-center text-label`}>{r.fund}</td><td className={tdr}>{wonOrDash(r.budget)}</td><td className={tdr}>{wonOrDash(r.actual)}</td><td className={tdr}>{rate(r.actual, r.budget)}</td><td className={`${tdr} ${r.actual - r.budget < 0 ? "text-danger" : ""}`}>{won(r.actual - r.budget)}</td></tr>)}
                    {rows.length > 0 && <tr className="bg-surface-2 font-semibold"><td className={td} colSpan={2}>{f} 소계</td><td className={tdr}>{won(t.budget)}</td><td className={tdr}>{won(t.actual)}</td><td className={tdr}>{rate(t.actual, t.budget)}</td><td className={tdr}>{won(t.actual - t.budget)}</td></tr>}
                    {f === "특별" && <tr className="bg-primary-subtle font-bold"><td className={td} colSpan={2}>일반·특별 합계</td><td className={tdr}>{won(inc.operating.budget)}</td><td className={tdr}>{won(inc.operating.actual)}</td><td className={tdr}>{rate(inc.operating.actual, inc.operating.budget)}</td><td className={tdr}>{won(inc.operating.actual - inc.operating.budget)}</td></tr>}
                  </Fragment>
                );
              })}
              {!inc.rows.length && <tr><td className={`${td} text-center text-muted`} colSpan={6}>예산·수입이 없어요.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="break-before-page">
        <h3 className="mb-2 font-semibold">3. 지출 (부서·항목별 예산 대비)</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead><tr>{["부서", "항목", "예산(A)", "지출(B)", "집행률(B/A)", "잔액(A−B)"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              <tr className="bg-primary-subtle font-bold"><td className={td} colSpan={2}>합계(일반·특별)</td><td className={tdr}>{won(exp.operating.budget)}</td><td className={tdr}>{won(exp.operating.actual)}</td><td className={tdr}>{rate(exp.operating.actual, exp.operating.budget)}</td><td className={tdr}>{won(exp.operating.budget - exp.operating.actual)}</td></tr>
              {exp.depts.map((g) => (
                <Fragment key={g.dept}>
                  <tr className="bg-surface-2 font-semibold"><td className={td} colSpan={2}>{g.dept} 소계{g.fund === "별도" && <span className="ml-1 text-xs font-normal text-muted">별도 기금</span>}</td><td className={tdr}>{won(g.budget)}</td><td className={tdr}>{won(g.actual)}</td><td className={tdr}>{rate(g.actual, g.budget)}</td><td className={tdr}>{won(g.budget - g.actual)}</td></tr>
                  {g.items.filter((r) => r.budget || r.actual).map((r) => (
                    <tr key={r.id}><td className={td} /><td className={td}>{r.item}</td><td className={tdr}>{wonOrDash(r.budget)}</td><td className={tdr}>{wonOrDash(r.actual)}</td><td className={tdr}>{rate(r.actual, r.budget)}</td><td className={`${tdr} ${r.budget - r.actual < 0 ? "text-danger" : ""}`}>{won(r.budget - r.actual)}</td></tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted">예산·지출이 모두 없는 항목은 숨겼어요.</p>
      </section>
    </div>
  );
}

function sheets(d: S, year: number) {
  return [
    { name: "기금별 이월", widths: [12, 16, 16, 16, 16, 18], rows: [
      ["기금", `${year - 1}년 이월`, "수입", "지출", "회계 간 대체", `${year + 1}년 이월`],
      ...d.funds.map((f) => [f.name, f.carry, f.income, f.expense, f.transferIn - f.transferOut, f.next]),
    ] },
    { name: "수입", widths: [16, 8, 16, 16, 10, 16], rows: [
      ["헌금구분", "기금", "예산", "수입", "달성률", "차이"],
      ...d.income.rows.map((r) => [r.type, r.fund, r.budget, r.actual, rate(r.actual, r.budget), r.actual - r.budget]),
      ...d.income.funds.map((t) => [`${t.fund} 소계`, "", t.budget, t.actual, rate(t.actual, t.budget), t.actual - t.budget]),
      ["일반·특별 합계", "", d.income.operating.budget, d.income.operating.actual, rate(d.income.operating.actual, d.income.operating.budget), d.income.operating.actual - d.income.operating.budget],
    ] },
    { name: "지출", widths: [16, 22, 16, 16, 10, 16], rows: [
      ["부서", "항목", "예산", "지출", "집행률", "잔액"],
      ["합계(일반·특별)", "", d.expense.operating.budget, d.expense.operating.actual, rate(d.expense.operating.actual, d.expense.operating.budget), d.expense.operating.budget - d.expense.operating.actual],
      ...d.expense.depts.flatMap((g) => [
        [g.dept, "소계", g.budget, g.actual, rate(g.actual, g.budget), g.budget - g.actual],
        ...g.items.filter((r) => r.budget || r.actual).map((r) => ["", r.item, r.budget, r.actual, rate(r.actual, r.budget), r.budget - r.actual]),
      ]),
    ] },
  ];
}
