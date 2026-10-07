"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import YearSelect from "@/components/ui/YearSelect";
import { ExcelButton, PrintButton, btnPrimary, card, input } from "@/components/ui/Buttons";
import { useRefData } from "@/lib/db/refData";
import { useDbQuery } from "@/lib/db/useDb";
import { downloadXlsx } from "@/lib/excel";
import { fileName, thisYear, toAmount, won } from "@/lib/format";
import { fetchAll, safeTerm } from "@/lib/income/db";
import { FUNDS, MONTHS, displayName, matrixSheet, typeMonthMatrix, type IncomeViewRow } from "@/lib/income/report";
import { amt, td, tdNum, th } from "../_ui/sheet";
import FundMonthChart from "./FundMonthChart";

type Filter = { year: number; month: number; typeId: number; name: string; amount: string };
type TypeMonthRow = { year: number; month: number; offering_type_id: number; offering_type: string; type_order: number | null; fund_kind: string | null; channel: string; amount: number; n: number };
const SHOW = 1000; // 화면에 그리는 최대 행(엑셀은 전체)

// 과거 수입내역: 연·월로 찾고 이름·금액·헌금구분 검색, 헌금구분별·월별 리포트
export default function IncomeHistory() {
  const { ref } = useRefData();
  const [draft, setDraft] = useState<Filter>({ year: thisYear(), month: 0, typeId: 0, name: "", amount: "" });
  const [f, setF] = useState<Filter>(draft);
  const set = (p: Partial<Filter>) => setDraft((d) => ({ ...d, ...p }));
  // 연·월·구분은 바로, 이름·금액은 '검색'으로
  const pick = (p: Partial<Filter>) => { set(p); setF((x) => ({ ...x, ...p })); };

  const list = useDbQuery((sb) => fetchAll<IncomeViewRow>((a, b) => {
    let q = sb.from("v_income")
      .select("id, sunday, offering_type_id, offering_type, type_order, fund_kind, member_id, member_name, payer_label, channel, amount, memo, bank_tx_id")
      .eq("year", f.year);
    if (f.month) q = q.eq("month", f.month);
    if (f.typeId) q = q.eq("offering_type_id", f.typeId);
    const name = safeTerm(f.name);
    if (name) q = q.or(`member_name.ilike.*${name}*,payer_label.ilike.*${name}*`);
    if (toAmount(f.amount)) q = q.eq("amount", toAmount(f.amount));
    return q.order("sunday", { ascending: false }).order("type_order").order("id").range(a, b);
  }), [f]);
  const report = useDbQuery((sb) => fetchAll<TypeMonthRow>((a, b) => sb.from("v_income_type_month").select("*").eq("year", f.year)
    .order("month").order("offering_type_id").order("channel").range(a, b)), [f.year]);

  const matrix = useMemo(() => typeMonthMatrix(report.data ?? []), [report.data]);
  const channelSum = useMemo(() => {
    const rows = (report.data ?? []).filter((r) => !f.month || r.month === f.month);
    return { cash: rows.filter((r) => r.channel === "cash").reduce((s, r) => s + Number(r.amount), 0), online: rows.filter((r) => r.channel === "online").reduce((s, r) => s + Number(r.amount), 0) };
  }, [report.data, f.month]);
  const rows = list.data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const gs = matrix.byFund.일반.map((v, i) => v + matrix.byFund.특별[i]);
  const period = `${f.year}년${f.month ? ` ${f.month}월` : ""}`;

  const excel = () => downloadXlsx(fileName(`과거수입내역_${f.year}${f.month ? String(f.month).padStart(2, "0") : ""}`, "xlsx"), [
    {
      name: "목록", header: 2, widths: [12, 12, 18, 8, 12, 20],
      rows: [[`${period} 수입내역`], ["주일", "헌금구분", "이름", "구분", "금액", "메모"],
        ...rows.map((r) => [r.sunday, r.offering_type, displayName(r), r.channel === "cash" ? "현금" : "이체", Number(r.amount), r.memo ?? ""]),
        ["합계", "", "", "", total, ""]],
    },
    matrixSheet("헌금구분별 월별", `${f.year}년 헌금구분별 월별 수입`, matrix),
  ]);

  return (
    <>
      <PageHeader actions={<><ExcelButton disabled={list.loading} onClick={excel} /><PrintButton /></>} />
      <form onSubmit={(e) => { e.preventDefault(); setF(draft); }} className={`${card} no-print mb-4 flex flex-wrap items-end gap-3 p-3 text-sm`}>
        <label className="text-xs text-label">연도<div className="mt-1"><YearSelect value={draft.year} onChange={(y) => pick({ year: y })} /></div></label>
        <label className="text-xs text-label">월
          <select value={draft.month} onChange={(e) => pick({ month: Number(e.target.value) })} className={`${input} mt-1 block`}>
            <option value={0}>전체</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <label className="text-xs text-label">헌금구분
          <select value={draft.typeId} onChange={(e) => pick({ typeId: Number(e.target.value) })} className={`${input} mt-1 block`}>
            <option value={0}>전체</option>
            {(ref?.offeringTypes ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-label">이름<input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="이름·표기" className={`${input} mt-1 block w-32`} /></label>
        <label className="text-xs text-label">금액<input inputMode="numeric" value={draft.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^\d,]/g, "") })} placeholder="정확한 금액" className={`${input} mt-1 block w-32 text-right`} /></label>
        <button className={btnPrimary}>검색</button>
      </form>
      {(list.error || report.error) && <Notice kind="error">불러오지 못했어요: {list.error ?? report.error}</Notice>}

      <div className={`${card} mb-4 p-4 text-sm print:p-0`}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{f.year}년 헌금구분별 월별 수입</h2>
          <span className="text-xs text-label">
            {f.month ? `${f.month}월` : "1년"} 현금 {won(channelSum.cash)} · 이체 {won(channelSum.online)} · 일반·특별 {won(f.month ? gs[f.month - 1] : gs.reduce((s, v) => s + v, 0))}원
          </span>
        </div>
        {report.loading ? <div className="text-muted">불러오는 중…</div> : matrix.total === 0 ? <div className="text-muted">이 연도 수입이 없어요.</div> : (
          <>
            <div className="no-print"><FundMonthChart byFund={matrix.byFund} /></div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead><tr><th className={th}>기금</th><th className={th}>헌금구분</th>{MONTHS.map((m, i) => <th key={m} className={`${th} ${f.month === i + 1 ? "bg-primary-subtle" : ""}`}>{m}</th>)}<th className={th}>합계</th></tr></thead>
                <tbody>
                  {matrix.types.map((t) => (
                    <tr key={t.id}><td className={`${td} text-center`}>{t.fund}</td><td className={td}>{t.name}</td>{t.months.map((v, i) => <td key={i} className={tdNum}>{amt(v)}</td>)}<td className={`${tdNum} font-semibold`}>{amt(t.total)}</td></tr>
                  ))}
                  {FUNDS.map((fu) => (
                    <tr key={fu} className="bg-surface-2 font-semibold"><td className={td} colSpan={2}>{fu} 소계</td>{matrix.byFund[fu].map((v, i) => <td key={i} className={tdNum}>{amt(v)}</td>)}<td className={tdNum}>{amt(matrix.byFund[fu].reduce((s, v) => s + v, 0))}</td></tr>
                  ))}
                  <tr className="bg-primary-subtle font-bold"><td className={td} colSpan={2}>일반·특별 합계</td>{gs.map((v, i) => <td key={i} className={tdNum}>{amt(v)}</td>)}<td className={tdNum}>{amt(gs.reduce((s, v) => s + v, 0))}</td></tr>
                  <tr className="font-semibold"><td className={td} colSpan={2}>총계(별도 포함)</td>{matrix.monthTotals.map((v, i) => <td key={i} className={tdNum}>{amt(v)}</td>)}<td className={tdNum}>{amt(matrix.total)}</td></tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className={`${card} p-4 text-sm print:p-0`}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{period} 수입 목록</h2>
          <span className="text-xs text-label">{rows.length}건 · 합계 {won(total)}원{rows.length > SHOW && ` · 화면에는 ${SHOW}건만, 엑셀에는 전체`}</span>
        </div>
        {list.loading ? <div className="text-muted">불러오는 중…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr><th className={th}>주일</th><th className={th}>헌금구분</th><th className={th}>이름</th><th className={th}>구분</th><th className={th}>금액</th><th className={th}>메모</th></tr></thead>
              <tbody>
                {rows.slice(0, SHOW).map((r) => (
                  <tr key={r.id}>
                    <td className={`${td} whitespace-nowrap`}>{r.sunday}</td>
                    <td className={td}>{r.offering_type}</td>
                    <td className={td}>{displayName(r)}{r.member_id == null && r.payer_label !== "(총액)" && <span className="ml-1 text-[11px] text-muted">미등록</span>}</td>
                    <td className={`${td} text-center`}>{r.channel === "cash" ? "현금" : "이체"}{r.bank_tx_id && <span className="ml-1 text-[11px] text-info" title="은행거래에서 반영">은행</span>}</td>
                    <td className={tdNum}>{won(r.amount)}</td>
                    <td className={`${td} text-label`}>{r.memo}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className={`${td} py-6 text-center text-muted`}>찾는 수입이 없어요.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
