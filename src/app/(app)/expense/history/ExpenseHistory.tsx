"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import YearSelect from "@/components/ui/YearSelect";
import { ExcelButton, PrintButton, btn, card, input } from "@/components/ui/Buttons";
import { useDbQuery } from "@/lib/db/useDb";
import { fileName, thisYear, won } from "@/lib/format";
import { downloadXlsx } from "@/lib/excel";
import { fetchAll } from "@/lib/expense/db";
import { filterHistory, monthlyTotals, type HistFilter, type HistRow } from "@/lib/expense/history";

type Db = { id: number; sunday: string; month: number; department: string | null; item: string; content: string; amount: number; requester_label: string | null; memo: string | null };

export default function ExpenseHistory() {
  return <DbOnly what="과거 지출내역"><Screen /></DbOnly>;
}

function Screen() {
  // 기본은 올해, 지난 연도는 연도 선택으로
  const [year, setYear] = useState(thisYear());
  const [month, setMonth] = useState(0);
  const [f, setF] = useState<HistFilter>({});
  const [view, setView] = useState<"list" | "month">("list");

  const q = useDbQuery(async (sb) => {
    const rows = await fetchAll<Db>((a, b) => {
      let x = sb.from("v_expense").select("id, sunday, month, department, item, content, amount, requester_label, memo").eq("year", year);
      if (month) x = x.eq("month", month);
      return x.order("sunday").order("id").range(a, b);
    });
    return rows.map((r): HistRow => ({
      id: r.id, sunday: r.sunday, month: r.month, department: r.department ?? "", item: r.item, content: r.content,
      amount: Number(r.amount), requester: r.requester_label ?? "", memo: r.memo ?? "",
    }));
  }, [year, month]);

  const rows = useMemo(() => filterHistory(q.data ?? [], f), [q.data, f]);
  const months = useMemo(() => monthlyTotals(rows), [rows]);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const title = `${year}년 ${month ? `${month}월 ` : ""}지출내역`;
  const filtered = Object.values(f).some((v) => v?.trim());

  const excel = () => downloadXlsx(fileName(`과거지출내역_${year}${month ? `_${month}월` : ""}`, "xlsx"), [
    { name: "지출내역", rows: [["주일", "부서", "항목", "내용", "금액", "청구자", "비고"], ...rows.map((r) => [r.sunday, r.department, r.item, r.content, r.amount, r.requester, r.memo]), ["합계", "", "", "", total]], widths: [12, 14, 18, 30, 12, 10, 20] },
    { name: "월별합계", rows: [["월", "건수", "합계"], ...months.map((m) => [`${m.month}월`, m.count, m.total]), ["합계", rows.length, total]], widths: [8, 8, 14] },
  ]);

  const set = (k: keyof HistFilter) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      <PageHeader actions={<><ExcelButton onClick={excel} disabled={!rows.length} /><PrintButton /></>} />
      <div className={`${card} no-print mb-4 flex flex-wrap items-end gap-2 p-4 text-sm`}>
        <YearSelect value={year} onChange={setYear} />
        <select className={input} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          <option value={0}>전체 월</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}월</option>)}
        </select>
        <input className={`${input} w-28`} placeholder="이름(청구자)" value={f.name ?? ""} onChange={set("name")} />
        <input className={`${input} w-36`} placeholder="금액 (예: 10000~50000)" value={f.amount ?? ""} onChange={set("amount")} />
        <input className={`${input} w-36`} placeholder="내용·항목" value={f.content ?? ""} onChange={set("content")} />
        <input className={`${input} w-28`} placeholder="비고" value={f.memo ?? ""} onChange={set("memo")} />
        {filtered && <button className={btn} onClick={() => setF({})}>검색 지우기</button>}
        <div className="ml-auto flex overflow-hidden rounded border">
          {(["list", "month"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 ${view === v ? "bg-primary text-white" : ""}`}>{v === "list" ? "목록" : "월별 합계"}</button>)}
        </div>
      </div>
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}

      <h2 className="mb-1 hidden text-center text-lg font-bold print:block">{title}</h2>
      <div className="mb-2 text-sm text-label">{title} · {rows.length}건 · 합계 <b className="text-heading">{won(total)}원</b>{filtered && " (검색 결과)"}</div>
      <div className={`${card} overflow-x-auto`}>
        {view === "list" ? (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-label">
              <tr><th className="px-3 py-2 text-left">주일</th><th className="text-left">부서</th><th className="text-left">항목</th><th className="text-left">내용</th><th className="px-3 text-right">금액</th><th className="text-left">청구자</th><th className="text-left">비고</th></tr>
            </thead>
            <tbody>
              {q.loading && <tr><td colSpan={7} className="py-6 text-center text-muted">불러오는 중…</td></tr>}
              {!q.loading && !rows.length && <tr><td colSpan={7} className="py-6 text-center text-muted">지출내역이 없어요.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="whitespace-nowrap px-3 py-1.5">{r.sunday}</td><td>{r.department}</td><td>{r.item}</td><td className="text-heading">{r.content}</td>
                  <td className="px-3 text-right">{won(r.amount)}</td><td>{r.requester}</td><td className="text-label">{r.memo}</td>
                </tr>
              ))}
              {rows.length > 0 && <tr className="border-t bg-surface-2 font-semibold"><td className="px-3 py-1.5" colSpan={4}>합계</td><td className="px-3 text-right">{won(total)}</td><td colSpan={2} /></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-label"><tr><th className="px-3 py-2 text-left">월</th><th className="text-right">건수</th><th className="px-3 text-right">합계</th></tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-t"><td className="px-3 py-1.5">{m.month}월</td><td className="text-right">{m.count}</td><td className="px-3 text-right">{won(m.total)}</td></tr>
              ))}
              <tr className="border-t bg-surface-2 font-semibold"><td className="px-3 py-1.5">합계</td><td className="text-right">{rows.length}</td><td className="px-3 text-right">{won(total)}</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
