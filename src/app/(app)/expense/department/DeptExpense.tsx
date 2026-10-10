"use client";
import { Fragment, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import YearSelect from "@/components/ui/YearSelect";
import { ExcelButton, PrintButton, btn, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { fileName, thisYear, won } from "@/lib/format";
import { downloadXlsx } from "@/lib/excel";
import { byDepartment, deptInsights, periodRange, type DeptTx, type FundBalance, type ItemBudget } from "@/lib/expense/budget";
import { loadFundSettlement } from "@/lib/reports/load";
import { fetchAll } from "@/lib/expense/db";

type ItemRow = { id: number; name: string; sort_order: number | null; fund_id: number | null; department: { name: string; sort_order: number | null } | null };
type ExpRow = { expense_item_id: number; sunday: string; content: string; amount: number; requester_label: string | null; memo: string | null };
const PERIODS: [string, string][] = [
  ["Y", "연간"], ["H1", "상반기"], ["H2", "하반기"], ["Q1", "1분기"], ["Q2", "2분기"], ["Q3", "3분기"], ["Q4", "4분기"],
  ...Array.from({ length: 12 }, (_, i): [string, string] => [`M${i + 1}`, `${i + 1}월`]),
  ["C", "직접 지정"],
];
const th = "border border-line bg-surface-2 px-2 py-1.5 text-center font-semibold";
const td = "border border-line px-2 py-1";

export default function DeptExpense() {
  return <DbOnly what="부서별 지출내역"><Screen /></DbOnly>;
}

function Screen() {
  const [year, setYear] = useState(thisYear());
  const [period, setPeriod] = useState("Y");
  const [custom, setCustom] = useState<[string, string]>([`${thisYear()}-01-01`, `${thisYear()}-12-31`]);
  const [dept, setDept] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());

  const q = useDbQuery(async (sb) => {
    const [items, budgets, txs, deptRows, funds] = await Promise.all([
      sb.from("expense_item").select("id, name, sort_order, fund_id, department(name, sort_order)").then(must),
      sb.from("budget").select("expense_item_id, amount").eq("year", year).not("expense_item_id", "is", null).then(must),
      fetchAll<ExpRow>((a, b) => sb.from("v_expense").select("expense_item_id, sunday, content, amount, requester_label, memo").eq("year", year).order("sunday").order("id").range(a, b)),
      sb.from("department").select("name, sort_order").order("sort_order").order("name").then(must),
      loadFundSettlement(sb, year),
    ]);
    const kind = new Map(funds.map((f) => [f.fundId, f.kind]));
    const bud = new Map<number, number>();
    (budgets as { expense_item_id: number; amount: number }[]).forEach((b) => bud.set(b.expense_item_id, (bud.get(b.expense_item_id) ?? 0) + Number(b.amount)));
    const list: ItemBudget[] = (items as unknown as ItemRow[]).map((i) => ({
      itemId: i.id, dept: i.department?.name ?? "(부서 없음)", deptOrder: i.department?.sort_order ?? 999, item: i.name, itemOrder: i.sort_order ?? 0, budget: bud.get(i.id) ?? 0,
      // 특별·별도 기금 항목은 예산을 세우지 않는다(헌금으로 지출) → 예산 대비 잔액을 내지 않음
      fundId: i.fund_id ?? undefined, noBudget: !bud.get(i.id) && !!i.fund_id && kind.has(i.fund_id) && kind.get(i.fund_id) !== "general",
    }));
    const tx: DeptTx[] = txs.map((t) => ({ itemId: t.expense_item_id, sunday: t.sunday, content: t.content, amount: Number(t.amount), requester: t.requester_label ?? "", memo: t.memo ?? "" }));
    const deptNames = (deptRows as { name: string | null }[]).map((d) => d.name ?? "").filter(Boolean);
    // 기금 부서 이름 → 그 기금의 올해 이월·수입·지출·잔액
    const fundByDept = new Map<string, FundBalance>();
    list.filter((i) => i.noBudget && i.fundId).forEach((i) => {
      const f = funds.find((x) => x.fundId === i.fundId);
      if (f && !fundByDept.has(i.dept)) fundByDept.set(i.dept, { name: f.name, carry: f.carry, income: f.income + f.transferIn, expense: f.expense + f.transferOut, balance: f.next });
    });
    const asOf = txs.reduce<string | null>((m, t) => (!m || t.sunday > m ? t.sunday : m), null);
    return { list, tx, deptNames, fundByDept, asOf };
  }, [year]);

  const [from, to] = period === "C" ? custom : periodRange(year, period);
  const result = useMemo(() => (q.data ? byDepartment(q.data.list, q.data.tx, from, to) : null), [q.data, from, to]);
  const depts = (result?.depts ?? []).filter((d) => !dept || d.dept === dept);
  // 탭: 전체 + 부서 테이블 순서, 부서 테이블에 없는 이름(예: 부서 없음)은 뒤에
  const tabs = [...(q.data?.deptNames ?? [])];
  result?.depts.forEach((d) => { if (!tabs.includes(d.dept)) tabs.push(d.dept); });
  const total = dept ? (depts[0] ?? { budget: 0, spent: 0, remain: 0, rate: "-", noBudget: false }) : result ? { ...result.total, noBudget: false } : undefined;
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOpen = depts.every((d) => d.items.every((i) => !i.txs.length || open.has(i.itemId)));
  const periodLabel = `${from} ~ ${to}`;
  const insights = result && q.data ? deptInsights(result, { from, to, asOf: q.data.asOf, dept: dept || undefined, funds: q.data.fundByDept }) : [];
  const show = (n: number, noBudget: boolean) => (noBudget ? "-" : won(n));

  const excel = () => {
    if (!result) return;
    const sum = [["부서", "항목", "예산", "지출", "잔액", "집행률"]];
    const rows: (string | number)[][] = [...sum];
    depts.forEach((d) => {
      rows.push([`${d.dept} 소계`, "", d.noBudget ? "-" : d.budget, d.spent, d.noBudget ? "-" : d.remain, d.rate]);
      d.items.forEach((i) => rows.push([d.dept, `ㄴ ${i.item}`, i.noBudget ? "-" : i.budget, i.spent, i.noBudget ? "-" : i.remain, i.rate]));
    });
    if (total) rows.push([dept || !result.fundSpent ? "합계" : "합계(기금 지출 제외)", "", total.noBudget ? "-" : total.budget, total.spent, total.noBudget ? "-" : total.remain, total.rate]);
    const detail: (string | number)[][] = [["부서", "항목", "주일", "내용", "금액", "청구자", "비고"]];
    depts.forEach((d) => d.items.forEach((i) => i.txs.forEach((t) => detail.push([d.dept, i.item, t.sunday, t.content, t.amount, t.requester, t.memo]))));
    downloadXlsx(fileName(`부서별지출_${year}${dept ? `_${dept}` : ""}`, "xlsx"), [
      { name: "부서별", rows: [[`${year}년 부서별 지출내역${dept ? ` - ${dept}` : ""} (${periodLabel})`], [], ...rows], header: 3, widths: [18, 20, 14, 14, 14, 10] },
      { name: "지출상세", rows: detail, widths: [14, 18, 12, 30, 12, 10, 20] },
    ]);
  };

  return (
    <>
      <PageHeader actions={<><ExcelButton onClick={excel} disabled={!result} /><PrintButton /></>} />
      <div className={`${card} no-print mb-4 flex flex-wrap items-end gap-2 p-4 text-sm`}>
        <YearSelect value={year} onChange={(y) => { setYear(y); setCustom([`${y}-01-01`, `${y}-12-31`]); }} />
        <select className={input} value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {period === "C" && <>
          <input type="date" className={input} value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} />
          <span>~</span>
          <input type="date" className={input} value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} />
        </>}
        <button className={`${btn} ml-auto`} onClick={() => setOpen(allOpen ? new Set() : new Set(depts.flatMap((d) => d.items.map((i) => i.itemId))))}>{allOpen ? "상세 모두 접기" : "상세 모두 펼치기"}</button>
      </div>
      {q.data && (
        <div role="tablist" aria-label="부서" className="no-print mb-4 flex flex-wrap gap-1 border-b border-line text-sm">
          {["", ...tabs].map((t) => (
            <button key={t || "all"} type="button" role="tab" aria-selected={dept === t} onClick={() => setDept(t)}
              className={`-mb-px border-b-2 px-3 py-2 font-medium ${dept === t ? "border-primary text-primary" : "border-transparent text-label hover:text-heading"}`}>
              {t || "전체"}
            </button>
          ))}
        </div>
      )}
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      {q.loading && <div className="text-sm text-muted">불러오는 중…</div>}

      {result && insights.length > 0 && (
        <div className={`${card} mb-4 p-4 text-sm`}>
          <div className="mb-2 font-semibold text-heading">{dept || "전체"} 인사이트 <span className="text-xs font-normal text-muted">({periodLabel}{q.data?.asOf ? `, 자료 ${q.data.asOf}까지` : ""})</span></div>
          <ul className="list-disc space-y-1 pl-5 text-label">{insights.map((t, k) => <li key={k}>{t}</li>)}</ul>
        </div>
      )}
      {result && (
        <div className={`${card} p-6 text-sm print:p-0`}>
          <h2 className="text-center text-lg font-bold">{year}년 부서별 지출내역{dept && ` - ${dept}`}</h2>
          <div className="mb-2 text-right text-label">기간 {periodLabel}</div>
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>부서</th><th className={th}>항목</th><th className={th}>예산</th><th className={th}>지출</th><th className={th}>잔액</th><th className={th}>집행률</th></tr></thead>
            <tbody>
              {total && <tr className="bg-primary-subtle font-bold">
                <td className={td} colSpan={2}>합 계{!dept && result.fundSpent > 0 && <span className="ml-1 text-xs font-normal">(기금 지출 {won(result.fundSpent)} 제외)</span>}</td><td className={`${td} text-right`}>{show(total.budget, total.noBudget)}</td><td className={`${td} text-right`}>{won(total.spent)}</td>
                <td className={`${td} text-right`}>{show(total.remain, total.noBudget)}</td><td className={`${td} text-right`}>{total.rate}</td>
              </tr>}
              {depts.map((d) => (
                <Fragment key={d.dept}>
                  <tr className="bg-surface-2 font-semibold">
                    <td className={td} colSpan={2}>{d.dept} 소계{d.noBudget && <span className="ml-1 text-xs font-normal text-muted">(기금·예산 없음)</span>}</td><td className={`${td} text-right`}>{show(d.budget, d.noBudget)}</td><td className={`${td} text-right`}>{won(d.spent)}</td>
                    <td className={`${td} text-right ${d.remain < 0 ? "text-danger" : ""}`}>{show(d.remain, d.noBudget)}</td><td className={`${td} text-right`}>{d.rate}</td>
                  </tr>
                  {d.items.map((i) => (
                    <Fragment key={i.itemId}>
                      <tr className={i.txs.length ? "cursor-pointer hover:bg-surface-2" : ""} onClick={() => i.txs.length && toggle(i.itemId)}>
                        <td className={td} />
                        <td className={td}>{i.txs.length > 0 && <span className="no-print mr-1 text-muted">{open.has(i.itemId) ? "▾" : "▸"}</span>}<span className="text-muted">ㄴ </span>{i.item} <span className="text-xs text-muted">({i.txs.length}건)</span></td>
                        <td className={`${td} text-right`}>{show(i.budget, !!i.noBudget)}</td><td className={`${td} text-right`}>{won(i.spent)}</td>
                        <td className={`${td} text-right ${i.remain < 0 ? "text-danger" : ""}`}>{show(i.remain, !!i.noBudget)}</td><td className={`${td} text-right`}>{i.rate}</td>
                      </tr>
                      {open.has(i.itemId) && i.txs.map((t, k) => (
                        <tr key={k} className="text-xs text-label">
                          <td className={td} /><td className={`${td} pl-8`}><span className="text-muted">ㄴ </span>{t.sunday}</td>
                          <td className={td} colSpan={2}>{t.content}{t.requester && <span className="text-muted"> · {t.requester}</span>}{t.memo && <span className="text-muted"> · {t.memo}</span>}</td>
                          <td className={`${td} text-right`}>{won(t.amount)}</td><td className={td} />
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
              {!depts.length && <tr><td colSpan={6} className={`${td} py-6 text-center text-muted`}>예산이나 지출이 없어요.</td></tr>}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted no-print">예산은 그 해 항목별 예산, 지출은 지출 항목 기준(수수료 제외)이에요. 특별회계·해외선교처럼 예산 없이 헌금으로 쓰는 기금은 예산·잔액을 &apos;-&apos;로 두고 합계에서 빼요(기금 잔액은 위 인사이트). 예비비에서 끌어 쓴 지출(예산 전용)을 원래 항목·예비비 중 어디에 셀지는 [확인 필요].</p>
        </div>
      )}
    </>
  );
}
