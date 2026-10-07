"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { CLERGY_PAY, CLERGY_TITLES } from "@/lib/demo";

const won = (n: number) => n.toLocaleString("ko-KR");
const YEARS = [...new Set(CLERGY_PAY.map((p) => p.year))].sort((a, b) => b - a);

export default function ClergyPay() {
  const [year, setYear] = useState(YEARS[0]);
  const [month, setMonth] = useState(0); // 0 = 전체
  const [name, setName] = useState("");
  const [view, setView] = useState<"month" | "detail">("month");

  const rows = useMemo(
    () => CLERGY_PAY.filter((p) => p.year === year && (!month || p.month === month) && (!name || p.name.includes(name.trim()))),
    [year, month, name],
  );
  // 사람(직분 순) × 월 합계
  const people = useMemo(() => {
    const m = new Map<string, { name: string; title: string; byMonth: number[] }>();
    rows.forEach((r) => {
      const k = r.name;
      if (!m.has(k)) m.set(k, { name: r.name, title: r.title, byMonth: Array(13).fill(0) });
      m.get(k)!.byMonth[r.month] += r.amount;
    });
    const order = (t: string) => CLERGY_TITLES.indexOf(t as (typeof CLERGY_TITLES)[number]);
    return [...m.values()].sort((a, b) => order(a.title) - order(b.title) || a.name.localeCompare(b.name, "ko"));
  }, [rows]);
  const months = month ? [month] : Array.from({ length: 12 }, (_, i) => i + 1);
  const colTotal = (mo: number) => people.reduce((s, p) => s + p.byMonth[mo], 0);
  const total = rows.reduce((s, r) => s + r.amount, 0);

  const sel = "rounded border px-2 py-1.5 text-sm";
  return (
    <>
      <PageHeader actions={<>
        <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">가상 데이터</span>
        <button onClick={() => window.print()} className="no-print rounded border px-3 py-1 text-sm">출력</button>
      </>} />
      <div className="no-print mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-surface shadow-card p-4 text-sm">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={sel}>{YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}</select>
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
      <div className="mb-2 text-sm text-slate-600">{year}년 {month ? `${month}월` : "전체"} · {people.length}명 · 합계 <b>{won(total)}원</b></div>

      <div className="overflow-x-auto rounded-lg bg-surface shadow-card">
        {view === "month" ? (
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-surface-2 text-xs text-label">
              <tr><th className="px-3 py-2 text-left">직분</th><th className="px-3 text-left">이름</th>{months.map((m) => <th key={m} className="px-3 text-right">{m}월</th>)}<th className="px-3 text-right">합계</th></tr>
            </thead>
            <tbody>
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
    </>
  );
}
