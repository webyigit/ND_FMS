// 재직회보고서 계산: 원본 '제직회' 시트(연간 누계 지출 현황) 구조
export type BudgetItem = { dept: string; item: string; budget: number };
export type ExpenseTx = { date: string; dept: string; item: string; content: string; amount: number; memo?: string };

export type ReportRow =
  | { kind: "total" | "subtotal"; dept: string; budget: number; spent: number }
  | { kind: "item"; dept: string; item: string; budget: number; spent: number; firstOfDept: boolean };

/** 합계 행이 맨 위, 부서 소계가 그 부서 항목들 위에 오는 원본 순서 */
export function spendingStatus(budgets: BudgetItem[], txs: ExpenseTx[], from: string, to: string): ReportRow[] {
  const spentBy = new Map<string, number>();
  for (const t of txs) if (t.date >= from && t.date <= to) spentBy.set(`${t.dept}|${t.item}`, (spentBy.get(`${t.dept}|${t.item}`) ?? 0) + t.amount);
  const depts = [...new Set(budgets.map((b) => b.dept))];
  const rows: ReportRow[] = [];
  let tb = 0, ts = 0;
  for (const d of depts) {
    const items = budgets.filter((b) => b.dept === d).map((b, i) => ({ kind: "item" as const, dept: d, item: b.item, budget: b.budget, spent: spentBy.get(`${d}|${b.item}`) ?? 0, firstOfDept: i === 0 }));
    const sb = items.reduce((s, x) => s + x.budget, 0), ss = items.reduce((s, x) => s + x.spent, 0);
    tb += sb; ts += ss;
    rows.push({ kind: "subtotal", dept: d, budget: sb, spent: ss }, ...items);
  }
  return [{ kind: "total", dept: "합 계", budget: tb, spent: ts }, ...rows];
}

export const rate = (spent: number, budget: number) => (budget ? `${((spent / budget) * 100).toFixed(2)}%` : "-");
export const remain = (budget: number, spent: number) => budget - spent;

/** 해외선교 원장: 이월금으로 시작, 월 합계 행 자동 생성 */
export type MissionTx = { date: string; content: string; income: number; expense: number };
export function missionLedger(carry: number, txs: MissionTx[], year: number) {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  const rows: ({ kind: "tx"; balance: number } & MissionTx | { kind: "month"; month: number; income: number; expense: number })[] = [];
  let bal = carry, month = 0, mi = 0, me = 0;
  rows.push({ kind: "tx", date: `${year}-01-01`, content: `${String(year - 1).slice(2)}년도 이월금`, income: carry, expense: 0, balance: bal });
  for (const t of sorted) {
    const m = Number(t.date.slice(5, 7));
    if (month && m !== month) { rows.push({ kind: "month", month, income: mi, expense: me }); mi = me = 0; }
    month = m; bal += t.income - t.expense; mi += t.income; me += t.expense;
    rows.push({ kind: "tx", ...t, balance: bal });
  }
  if (month) rows.push({ kind: "month", month, income: mi, expense: me });
  const income = txs.reduce((s, t) => s + t.income, 0), expense = txs.reduce((s, t) => s + t.expense, 0);
  return { rows, summary: { carry, income, sum: carry + income, expense, balance: carry + income - expense } };
}
