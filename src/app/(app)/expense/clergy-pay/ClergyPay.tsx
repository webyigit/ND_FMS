"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import YearSelect from "@/components/ui/YearSelect";
import { ExcelButton, PrintButton, btn } from "@/components/ui/Buttons";
import { CLERGY_PAY, CLERGY_TITLES } from "@/lib/demo";
import { must, useDbQuery } from "@/lib/db/useDb";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fileName, thisYear, won } from "@/lib/format";
import { downloadXlsx } from "@/lib/excel";
import { fetchAll } from "@/lib/expense/db";
import { clergyByPerson, type ClergyRow } from "@/lib/expense/clergy";
import ClergyEditor, { type Clergy, type Item } from "./ClergyEditor";

const DEMO_YEARS = [...new Set(CLERGY_PAY.map((p) => p.year))].sort((a, b) => b - a);
type Db = { sunday: string; year: number; month: number; name: string; title: string; sort_order: number; item: string; amount: number };
type ItemDb = { id: number; name: string; department: { name: string; sort_order: number | null } | null };

// 교역자급여내역: DB가 있으면 교역자 목록(이름·직분·지출 항목·내용 말)에 맞는 지출에서, 없으면 가상 데이터
export default function ClergyPay() {
  const demo = !supabaseBrowser();
  const [year, setYear] = useState(demo ? DEMO_YEARS[0] : thisYear());
  const [month, setMonth] = useState(0); // 0 = 전체
  const [name, setName] = useState("");
  const [view, setView] = useState<"month" | "detail">("month");
  const [who, setWho] = useState(""); // 지급 상세 탭: "" = 전체
  const [editing, setEditing] = useState(false);

  const q = useDbQuery(async (sb) => {
    const rows = await fetchAll<Db>((a, b) => sb.from("v_clergy_salary").select("sunday, year, month, name, title, sort_order, item, amount").eq("year", year).order("sunday").order("id").range(a, b));
    return rows.map((r): ClergyRow => ({ year: r.year, month: r.month, name: r.name, title: r.title, item: r.item, amount: Number(r.amount), paidAt: r.sunday, order: r.sort_order }));
  }, [year]);
  // 등록된 교역자와 지출 항목(추가하기용)
  const ref = useDbQuery(async (sb) => {
    const [clergy, items] = await Promise.all([
      sb.from("clergy").select("id, name, title, expense_item_id, keyword, sort_order").order("sort_order").order("id"),
      sb.from("expense_item").select("id, name, sort_order, department(name, sort_order)").order("sort_order"),
    ]);
    const its = (must(items) as unknown as ItemDb[])
      .sort((a, b) => (a.department?.sort_order ?? 99) - (b.department?.sort_order ?? 99))
      .map((i): Item => ({ id: i.id, name: i.name, dept: i.department?.name ?? "" }));
    return { clergy: must(clergy) as Clergy[], items: its };
  }, []);
  const roster = useMemo(() => (ref.data?.clergy ?? []).map((c) => ({ name: c.name, title: c.title, order: c.sort_order })), [ref.data]);
  const source: ClergyRow[] = useMemo(() => (demo ? CLERGY_PAY.filter((p) => p.year === year) : q.data ?? []), [demo, year, q.data]);

  const rows = useMemo(() => source.filter((p) => (!month || p.month === month) && (!name || p.name.includes(name.trim()))), [source, month, name]);
  const people = useMemo(() => clergyByPerson(rows, CLERGY_TITLES, roster.filter((c) => !name || c.name.includes(name.trim()))), [rows, roster, name]);
  const months = month ? [month] : Array.from({ length: 12 }, (_, i) => i + 1);
  const colTotal = (mo: number) => people.reduce((s, p) => s + p.byMonth[mo], 0);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  // 지급 상세 탭: 전체 + 교역자 순서대로(지급 내역이 있는 사람)
  const whoTabs = people.map((p) => p.name).filter((n) => rows.some((r) => r.name === n));
  const cur = whoTabs.includes(who) ? who : ""; // 연도·월을 바꿔 그 사람 내역이 없으면 전체
  const detail = useMemo(() => rows.filter((r) => !cur || r.name === cur), [rows, cur]);

  const excel = () => downloadXlsx(fileName(`교역자급여내역_${year}`, "xlsx"), [
    { name: "월별합계", rows: [["직분", "이름", "합계", ...months.map((m) => `${m}월`)], ...people.map((p) => [p.title, p.name, p.byMonth.reduce((a, b) => a + b, 0), ...months.map((m) => p.byMonth[m])]), ["합계", "", total, ...months.map(colTotal)]] },
    { name: cur ? `지급상세_${cur}` : "지급상세", rows: [["지급일(주일)", "직분", "이름", "항목", "금액"], ...detail.map((r) => [r.paidAt, r.title, r.name, r.item, r.amount])], widths: [14, 10, 10, 24, 12] },
  ]);

  const sel = "rounded border px-2 py-1.5 text-sm";
  return (
    <>
      <PageHeader actions={<>
        {demo && <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">가상 데이터</span>}
        {!demo && <button onClick={() => setEditing((v) => !v)} className={`no-print ${btn}`}>교역자 추가하기</button>}
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
      {!demo && editing && supabaseBrowser() && ref.data && (
        <ClergyEditor sb={supabaseBrowser()!} clergy={ref.data.clergy} items={ref.data.items} onChange={() => { ref.reload(); q.reload(); }} onClose={() => setEditing(false)} />
      )}
      {!demo && (q.error || ref.error) && <Notice kind="error">불러오지 못했어요: {q.error || ref.error}</Notice>}
      <div className="mb-2 text-sm text-slate-600">{year}년 {month ? `${month}월` : "전체"} · {people.length}명 · 합계 <b>{won(total)}원</b></div>

      <div className="overflow-x-auto rounded-lg bg-surface shadow-card">
        {view === "month" ? (
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-surface-2 text-xs text-label">
              <tr><th className="px-3 py-2 text-left">직분</th><th className="px-3 text-left">이름</th><th className="px-3 text-right">합계</th>{months.map((m) => <th key={m} className="px-3 text-right">{m}월</th>)}</tr>
            </thead>
            <tbody>
              {!demo && q.loading && <tr><td colSpan={months.length + 3} className="py-6 text-center text-muted">불러오는 중…</td></tr>}
              {people.map((p) => (
                <tr key={p.name} className="border-t">
                  <td className="px-3 py-1.5 text-label">{p.title}</td><td className="px-3">{p.name}</td>
                  <td className="px-3 text-right font-semibold">{won(p.byMonth.reduce((a, b) => a + b, 0))}</td>
                  {months.map((m) => <td key={m} className="px-3 text-right">{p.byMonth[m] ? won(p.byMonth[m]) : "-"}</td>)}
                </tr>
              ))}
              <tr className="border-t bg-surface-2 font-semibold">
                <td className="px-3 py-1.5" colSpan={2}>합계</td>
                <td className="px-3 text-right">{won(total)}</td>
                {months.map((m) => <td key={m} className="px-3 text-right">{won(colTotal(m))}</td>)}
              </tr>
            </tbody>
          </table>
        ) : (
          <>
          <div role="tablist" aria-label="교역자" className="no-print flex flex-wrap gap-1 border-b border-line px-2 text-sm">
            {["", ...whoTabs].map((t) => (
              <button key={t || "all"} type="button" role="tab" aria-selected={cur === t} onClick={() => setWho(t)}
                className={`-mb-px border-b-2 px-3 py-2 font-medium ${cur === t ? "border-primary text-primary" : "border-transparent text-label hover:text-heading"}`}>
                {t || "전체"}
              </button>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-label">
              <tr><th className="px-3 py-2 text-left">지급일</th><th className="px-3 text-left">직분</th><th className="px-3 text-left">이름</th><th className="px-3 text-left">항목</th><th className="px-3 text-right">금액</th></tr>
            </thead>
            <tbody>
              {detail.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-1.5">{r.paidAt}</td><td className="px-3 text-label">{r.title}</td><td className="px-3">{r.name}</td><td className="px-3">{r.item}</td><td className="px-3 text-right">{won(r.amount)}</td>
                </tr>
              ))}
              {!detail.length && <tr><td colSpan={5} className="py-6 text-center text-muted">지급 내역이 없어요.</td></tr>}
              {detail.length > 0 && <tr className="border-t bg-surface-2 font-semibold">
                <td className="px-3 py-1.5" colSpan={4}>{cur || "전체"} 합계 ({detail.length}건)</td>
                <td className="px-3 text-right">{won(detail.reduce((s, r) => s + r.amount, 0))}</td>
              </tr>}
            </tbody>
          </table>
          </>
        )}
      </div>
      {!demo && <p className="mt-3 text-xs text-muted">‘교역자 추가하기’에 등록한 교역자마다, 정한 지출 항목의 지출(내용에 들어간 말을 정했으면 그 말이 든 것만)을 모아요. 지급일은 그 지출이 들어간 주일이에요.</p>}
    </>
  );
}
