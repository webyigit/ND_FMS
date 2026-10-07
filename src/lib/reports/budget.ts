// 결산·예산 계산: 예산 대비 수입·지출, 기금별 이월, 내년도 예산 편집
import { sum, type ExpWeek, type Fund, type IncWeek } from "./common";

/** 헌금구분·지출항목 기준정보 (예산 표의 줄) */
export type OtRef = { id: number; name: string; fund: Fund; order: number };
export type ItemRef = { id: number; dept: string; deptOrder: number; item: string; itemOrder: number; fund: Fund };
/** budget 테이블 1행 */
export type BudgetRow = { offeringTypeId: number | null; expenseItemId: number | null; amount: number };

const FUND_ORDER: Record<Fund, number> = { 일반: 1, 특별: 2, 별도: 3 };
export const sortTypes = (xs: OtRef[]) => [...xs].sort((a, b) => FUND_ORDER[a.fund] - FUND_ORDER[b.fund] || a.order - b.order || a.id - b.id);
export const sortItems = (xs: ItemRef[]) => [...xs].sort((a, b) => a.deptOrder - b.deptOrder || a.dept.localeCompare(b.dept) || a.itemOrder - b.itemOrder || a.id - b.id);

export const budgetOfType = (bs: BudgetRow[]) => {
  const m = new Map<number, number>();
  bs.forEach((b) => b.offeringTypeId != null && m.set(b.offeringTypeId, (m.get(b.offeringTypeId) ?? 0) + b.amount));
  return m;
};
export const budgetOfItem = (bs: BudgetRow[]) => {
  const m = new Map<number, number>();
  bs.forEach((b) => b.expenseItemId != null && m.set(b.expenseItemId, (m.get(b.expenseItemId) ?? 0) + b.amount));
  return m;
};

export type IncomeLine = { id: number; type: string; fund: Fund; budget: number; actual: number };
export type FundTotal = { fund: Fund; budget: number; actual: number };

/** 헌금구분별 예산 대비 수입 + 기금별 소계 + 일반·특별 합계 (예산·실적 둘 다 0인 구분은 뺀다) */
export function settleIncome(types: OtRef[], budgets: BudgetRow[], inc: IncWeek[], year: number) {
  const b = budgetOfType(budgets);
  const actual = new Map<string, number>();
  inc.filter((r) => r.sunday.startsWith(`${year}-`)).forEach((r) => actual.set(r.type, (actual.get(r.type) ?? 0) + r.amount));
  const rows: IncomeLine[] = sortTypes(types).map((t) => ({ id: t.id, type: t.name, fund: t.fund, budget: b.get(t.id) ?? 0, actual: actual.get(t.name) ?? 0 }))
    .filter((r) => r.budget || r.actual);
  const funds: FundTotal[] = (["일반", "특별", "별도"] as Fund[]).map((f) => ({ fund: f, budget: sum(rows.filter((r) => r.fund === f), (r) => r.budget), actual: sum(rows.filter((r) => r.fund === f), (r) => r.actual) }));
  const op = rows.filter((r) => r.fund !== "별도");
  return { rows, funds, operating: { budget: sum(op, (r) => r.budget), actual: sum(op, (r) => r.actual) } };
}

export type ExpenseLine = { id: number; dept: string; item: string; fund: Fund; budget: number; actual: number };
export type DeptBlock = { dept: string; fund: Fund; budget: number; actual: number; items: ExpenseLine[] };

/** 부서·항목별 예산 대비 지출. 부서 소계, 일반·특별 합계와 별도 기금 합계 */
export function settleExpense(items: ItemRef[], budgets: BudgetRow[], exp: ExpWeek[], year: number) {
  const b = budgetOfItem(budgets);
  const actual = new Map<string, number>();
  exp.filter((r) => r.sunday.startsWith(`${year}-`)).forEach((r) => actual.set(`${r.dept}|${r.item}`, (actual.get(`${r.dept}|${r.item}`) ?? 0) + r.amount));
  const depts: DeptBlock[] = [];
  for (const it of sortItems(items)) {
    const line = { id: it.id, dept: it.dept, item: it.item, fund: it.fund, budget: b.get(it.id) ?? 0, actual: actual.get(`${it.dept}|${it.item}`) ?? 0 };
    let d = depts.find((x) => x.dept === it.dept);
    if (!d) depts.push((d = { dept: it.dept, fund: it.fund, budget: 0, actual: 0, items: [] }));
    d.items.push(line); d.budget += line.budget; d.actual += line.actual;
  }
  const op = depts.flatMap((d) => d.items).filter((r) => r.fund !== "별도");
  const sep = depts.flatMap((d) => d.items).filter((r) => r.fund === "별도");
  return {
    depts,
    operating: { budget: sum(op, (r) => r.budget), actual: sum(op, (r) => r.actual) },
    separate: { budget: sum(sep, (r) => r.budget), actual: sum(sep, (r) => r.actual) },
  };
}

/** 기금별 결산 (DB fund_settlement 결과와 같은 모양) */
export type FundSettle = { fundId: number; code: string; name: string; kind: string; carry: number; income: number; expense: number; transferIn: number; transferOut: number; next: number };
export const fundNext = (f: Omit<FundSettle, "next">) => f.carry + f.income - f.expense + f.transferIn - f.transferOut;

// ===== 내년도 예산 편집 =====
export type PlanLine = {
  key: string; kind: "income" | "expense"; id: number; group: string; label: string; fund: Fund;
  prevBudget: number; prevActual: number; requested: number; amount: number;
};

/** 편집 표: 기준정보 순서대로, 올해(편집 연도) 예산·전년 예산·전년 실적·승인된 예산신청 */
export function planLines(p: {
  types: OtRef[]; items: ItemRef[]; budgets: BudgetRow[]; prevBudgets: BudgetRow[];
  prevInc: IncWeek[]; prevExp: ExpWeek[]; requests: { expenseItemId: number | null; amount: number }[];
}): PlanLine[] {
  const cur = budgetOfType(p.budgets), prev = budgetOfType(p.prevBudgets);
  const curI = budgetOfItem(p.budgets), prevI = budgetOfItem(p.prevBudgets);
  const req = new Map<number, number>();
  p.requests.forEach((r) => r.expenseItemId != null && req.set(r.expenseItemId, (req.get(r.expenseItemId) ?? 0) + r.amount));
  const incAct = new Map<string, number>(), expAct = new Map<string, number>();
  p.prevInc.forEach((r) => incAct.set(r.type, (incAct.get(r.type) ?? 0) + r.amount));
  p.prevExp.forEach((r) => expAct.set(`${r.dept}|${r.item}`, (expAct.get(`${r.dept}|${r.item}`) ?? 0) + r.amount));
  return [
    ...sortTypes(p.types).map((t) => ({ key: `o${t.id}`, kind: "income" as const, id: t.id, group: t.fund, label: t.name, fund: t.fund,
      prevBudget: prev.get(t.id) ?? 0, prevActual: incAct.get(t.name) ?? 0, requested: 0, amount: cur.get(t.id) ?? 0 })),
    ...sortItems(p.items).map((i) => ({ key: `e${i.id}`, kind: "expense" as const, id: i.id, group: i.dept, label: i.item, fund: i.fund,
      prevBudget: prevI.get(i.id) ?? 0, prevActual: expAct.get(`${i.dept}|${i.item}`) ?? 0, requested: req.get(i.id) ?? 0, amount: curI.get(i.id) ?? 0 })),
  ];
}

/** 전년 예산을 그대로 복사 */
export const copyPrevBudget = (xs: PlanLine[]) => xs.map((x) => ({ ...x, amount: x.prevBudget }));

/** save_budget RPC 입력 (0원 줄은 빼고) */
export const toBudgetPayload = (xs: PlanLine[]) =>
  xs.filter((x) => x.amount > 0).map((x) => (x.kind === "income" ? { offering_type_id: x.id, amount: x.amount } : { expense_item_id: x.id, amount: x.amount }));

export const planSig = (xs: PlanLine[]) => JSON.stringify(toBudgetPayload(xs));

/** 그룹(기금·부서)별 소계 */
export function planGroups(xs: PlanLine[]) {
  const out: { kind: PlanLine["kind"]; group: string; lines: PlanLine[]; amount: number; prevBudget: number; prevActual: number; requested: number }[] = [];
  for (const x of xs) {
    let g = out.find((o) => o.kind === x.kind && o.group === x.group);
    if (!g) out.push((g = { kind: x.kind, group: x.group, lines: [], amount: 0, prevBudget: 0, prevActual: 0, requested: 0 }));
    g.lines.push(x); g.amount += x.amount; g.prevBudget += x.prevBudget; g.prevActual += x.prevActual; g.requested += x.requested;
  }
  return out;
}
