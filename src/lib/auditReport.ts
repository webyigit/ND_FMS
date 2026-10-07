// 재정감사보고서: 연 2회. 상반기 = 1~6월, 하반기 = 7~12월 + 당해연도 전체
import type { BudgetItem, ExpenseTx, MissionTx } from "./officersReport";

export type Half = "H1" | "H2";
export type Period = { key: string; label: string; from: string; to: string };
export type IncomeTx = { date: string; fund: "일반" | "특별" | "별도"; type: string; amount: number };
export type IncomeBudget = { fund: IncomeTx["fund"]; type: string; budget: number };

/** asOf(오늘)를 주면 아직 끝나지 않은 기간은 그날까지만 집계 */
export function auditPeriods(year: number, half: Half, asOf?: string): Period[] {
  const h1 = { key: "H1", label: "상반기(1~6월)", from: `${year}-01-01`, to: `${year}-06-30` };
  const h2 = { key: "H2", label: "하반기(7~12월)", from: `${year}-07-01`, to: `${year}-12-31` };
  const all = { key: "Y", label: `${year}년 전체`, from: `${year}-01-01`, to: `${year}-12-31` };
  const ps = half === "H1" ? [h1] : [h2, all];
  return asOf ? ps.map((p) => (p.to > asOf ? { ...p, to: asOf } : p)) : ps;
}
const inP = (d: string, p: Period) => d >= p.from && d <= p.to;
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

/** 헌금구분별 연예산·기간별 수입. 일반·특별 합계와 별도기금은 따로 (별도는 일반/특별 합계에서 제외) */
export function incomeTable(budgets: IncomeBudget[], txs: IncomeTx[], periods: Period[]) {
  const types = [...budgets.map((b) => `${b.fund}|${b.type}`), ...txs.map((t) => `${t.fund}|${t.type}`)].filter((k, i, a) => a.indexOf(k) === i);
  const rows = types.map((k) => {
    const [fund, type] = k.split("|") as [IncomeTx["fund"], string];
    return { fund, type, budget: budgets.find((b) => b.fund === fund && b.type === type)?.budget ?? 0,
      amounts: periods.map((p) => sum(txs.filter((t) => t.fund === fund && t.type === type && inP(t.date, p)), (t) => t.amount)) };
  });
  const total = (pred: (r: (typeof rows)[number]) => boolean, label: string) => ({
    fund: "", type: label, budget: sum(rows.filter(pred), (r) => r.budget), amounts: periods.map((_, i) => sum(rows.filter(pred), (r) => r.amounts[i])),
  });
  return { rows, general: total((r) => r.fund !== "별도", "일반·특별 합계"), separate: total((r) => r.fund === "별도", "별도기금 합계") };
}

/** 부서별 연예산·기간별 지출 */
export function expenseTable(budgets: BudgetItem[], txs: ExpenseTx[], periods: Period[]) {
  const depts = [...new Set(budgets.map((b) => b.dept))];
  const rows = depts.map((dept) => ({
    dept, budget: sum(budgets.filter((b) => b.dept === dept), (b) => b.budget),
    amounts: periods.map((p) => sum(txs.filter((t) => t.dept === dept && inP(t.date, p)), (t) => t.amount)),
  }));
  return { rows, total: { dept: "합 계", budget: sum(rows, (r) => r.budget), amounts: periods.map((_, i) => sum(rows, (r) => r.amounts[i])) } };
}

/** 월별 수입(일반·특별)·지출 */
export const monthly = (year: number, inc: IncomeTx[], exp: ExpenseTx[]) =>
  Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { month: i + 1, income: sum(inc.filter((t) => t.fund !== "별도" && t.date.startsWith(m)), (t) => t.amount), expense: sum(exp.filter((t) => t.date.startsWith(m)), (t) => t.amount) };
  });

/** 해외선교: 기간 시작 잔액(이월 + 이전 거래) → 수입·지출 → 기말 잔액 */
export function missionSummary(carry: number, txs: MissionTx[], p: Period) {
  const before = txs.filter((t) => t.date < p.from), within = txs.filter((t) => inP(t.date, p));
  const start = carry + sum(before, (t) => t.income - t.expense);
  const income = sum(within, (t) => t.income), expense = sum(within, (t) => t.expense);
  return { start, income, expense, end: start + income - expense };
}

export const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "-");
