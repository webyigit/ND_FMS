"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import YearSelect from "@/components/ui/YearSelect";
import { ExcelButton, PrintButton } from "@/components/ui/Buttons";
import { CLERGY_PAY, CLERGY_TITLES } from "@/lib/demo";
import { useDbQuery } from "@/lib/db/useDb";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fileName, thisYear, won } from "@/lib/format";
import { downloadXlsx } from "@/lib/excel";
import { fetchAll } from "@/lib/expense/db";
import { clergyByPerson, type ClergyRow } from "@/lib/expense/clergy";

const DEMO_YEARS = [...new Set(CLERGY_PAY.map((p) => p.year))].sort((a, b) => b - a);
type Db = { sunday: string; year: number; month: number; name: string; title: string; item: string; amount: number };

// 교역자급여내역: DB가 있으면 지출(지급처 → 교인 직분이 원로목사·담임목사·부목사·전도사)에서, 없으면 가상 데이터
export default function ClergyPay() {
  const demo = !supabaseBrowser();
  const [year, setYear] = useState(demo ? DEMO_YEARS[0] : thisYear());
  const [month, setMonth] = useState(0); // 0 = 전체
  const [name, setName] = useState("");
  const [view, setView] = useState<"month" | "detail">("month");

  const q = useDbQuery(async (sb) => {
    const rows = await fetchAll<Db>((a, b) => sb.from("v_clergy_pay").select("sunday, year, month, name, title, item, amount").eq("year", year).order("sunday").order("id").range(a, b));
    return rows.map((r): ClergyRow => ({ year: r.year, month: r.month, name: r.name, title: r.title, item: r.item, amount: Number(r.amount), paidAt: r.sunday }));
  }, [year]);
  const source: ClergyRow[] = useMemo(() => (demo ? CLERGY_PAY.filter((p) => p.year === year) : q.data ?? []), [demo, year, q.data]);

  const rows = useMemo(() => source.filter((p) => (!month || p.month === month) && (!name || p.name.includes(name.trim()))), [source, month, name]);
  const people = useMemo(() => clergyByPerson(rows, CLERGY_TITLES), [rows]);
  const months = month ? [month] : Array.from({ length: 12 }, (_, i) => i + 1);
  const colTotal = (mo: number) => people.reduce((s, p) => s + p.byMonth[mo], 0);
  const total = rows.reduce((s, r) => s + r.amount, 0);

  const excel = () => downloadXlsx(fileName(`교역자급여내역_${year}`, "xlsx"), [
    { name: "월별합계", rows: [["직분", "이름", ...months.map((m) => `${m}월`), "합계"], ...people.map((p) => [p.title, p.name, ...months.map((m) => p.byMonth[m]), p.byMonth.reduce((a, b) => a + b, 0)]), ["합계", "", ...months.map(colTotal), total]] },
    { name: "지급상세", rows: [["지급일(주일)", "직분", "이름", "항목", "금액"], ...rows.map((r) => [r.paidAt, r.title, r.name, r.item, r.amount])], widths: [14, 10, 10, 24, 12] },
  ]);

  const sel = "rounded border px-2 py-1.5 text-sm";
  return (
    <>
      <PageHeader actions={<>
        {demo && <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">가상 데이터</span>}
        <ExcelButton onClick={excel} disabled={!rows.length} />
        <PrintButton />
      </>} />
      <div className="no-print mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-surface shadow-card p-4 text-sm">
        {demo
          ? <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={sel}>{DEMO_YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}</select>
          : <YearSelect value={year} onChange={setYear} />}
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={sel}>
          <option value={0}>전체 월</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}월</option>)}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" className={sel} />
        <div className="ml-auto flex overflow-hidden rounded border">
          {(["month", "detail"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 ${view === v ? "bg-primary text-white" : ""}`}>{v === "month" ? "월별 합계" : "지급 상세"}</button>
          ))}
        </div>
      </div>
      {!demo && q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      <div className="mb-2 text-sm text-slate-600">{year}년 {month ? `${month}월` : "전체"} · {people.length}명 · 합계 <b>{won(total)}원</b></div>

      <div className="overflow-x-auto rounded-lg bg-surface shadow-card">
        {view === "month" ? (
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-surface-2 text-xs text-label">
              <tr><th className="px-3 py-2 text-left">직분</th><th className="px-3 text-left">이름</th>{months.map((m) => <th key={m} className="px-3 text-right">{m}월</th>)}<th className="px-3 text-right">합계</th></tr>
            </thead>
            <tbody>
              {!demo && q.loading && <tr><td colSpan={months.length + 3} className="py-6 text-center text-muted">불러오는 중…</td></tr>}
              {people.map((p) => (
                <tr key={p.name} className="border-t">
                  <td className="px-3 py-1.5 text-label">{p.title}</td><td className="px-3">{p.name}</td>
                  {months.map((m) => <td key={m} className="px-3 text-right">{p.byMonth[m] ? won(p.byMonth[m]) : "-"}</td>)}
                  <td className="px-3 text-right font-semibold">{won(p.byMonth.reduce((a, b) => a + b, 0))}</td>
                </tr>
              ))}
              <tr className="border-t bg-surface-2 font-semibold">
                <td className="px-3 py-1.5" colSpan={2}>합계</td>
                {months.map((m) => <td key={m} className="px-3 text-right">{won(colTotal(m))}</td>)}
                <td className="px-3 text-right">{won(total)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-label">
              <tr><th className="px-3 py-2 text-left">지급일</th><th className="px-3 text-left">직분</th><th className="px-3 text-left">이름</th><th className="px-3 text-left">항목</th><th className="px-3 text-right">금액</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-1.5">{r.paidAt}</td><td className="px-3 text-label">{r.title}</td><td className="px-3">{r.name}</td><td className="px-3">{r.item}</td><td className="px-3 text-right">{won(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {!demo && <p className="mt-3 text-xs text-muted">지출의 송금처(지급처)가 교인으로 연결되어 있고, 그 교인의 직분이 원로목사·담임목사·부목사·전도사인 지출만 모아요. 지급일은 그 지출이 들어간 주일이에요.</p>}
    </>
  );
}
