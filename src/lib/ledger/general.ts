// 총계원장(참고시트 '총' 시트) 계산. 올해 1월 1일부터 기준 주일까지 누계.
// 시트 구조: 요약(일반/특별/총계) → ■ 일반헌금(수입 구분별 예산·수입·비율 | 지출 부서별 예산·지출·비율)
//           → ■ 특별헌금(구분별 전년이월·수입·지출·잔액) → ■ 차입현황 | ■ 해외선교헌금+네팔 구호 헌금 → 결재란·감사위원회
export type Fund = "일반" | "특별" | "별도";
export type TypeRef = { id: number; name: string; parentId: number | null; order: number; fund: Fund };
export type ItemRef = { id: number; dept: string; deptOrder: number; item: string; fund: Fund };
export type BudgetRow = { offeringTypeId: number | null; expenseItemId: number | null; amount: number };
export type IncRow = { offeringTypeId: number; amount: number };
export type ExpRow = { expenseItemId: number; amount: number; fee: number };
export type Transfer = { from: Fund; to: Fund; amount: number };
export type Loan = { lender: string; principal: number };

export type LedgerInput = {
  year: number; sunday: string;
  types: TypeRef[]; items: ItemRef[]; budgets: BudgetRow[];
  /** 기금별 전년이월 (carryover) */
  carry: Record<Fund, number>;
  /** 특별헌금 구분별 전년이월 (offering_carryover) */
  typeCarry: Map<number, number>;
  income: IncRow[]; expense: ExpRow[]; transfers: Transfer[]; loans: Loan[];
  /** 지출에 송금 수수료를 넣을지 (금주 보고서·fund_balances 와 같게 기본 true) */
  withFee?: boolean;
};

export type SummaryRow = { label: string; budget: number; carry: number; income: number; total: number; expense: number; transfer: number; balance: number };
export type RateRow = { group: string; name: string; budget: number; actual: number; rate: number | null };
export type SpecialRow = { name: string; carry: number; income: number; expense: number; balance: number };
export type Ledger = {
  year: number; sunday: string;
  summary: { rows: SummaryRow[]; total: SummaryRow };
  general: { income: { total: RateRow; rows: RateRow[] }; expense: { total: RateRow; rows: RateRow[] } };
  special: { rows: SpecialRow[]; total: SpecialRow };
  loans: { rows: Loan[]; total: number };
  separate: SpecialRow;
};

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const rate = (actual: number, budget: number) => (budget ? (actual / budget) * 100 : null);

/** 시트의 수입 묶음: 일반헌금 / 절기헌금 / 기타헌금 (이름으로 판단) [확인 필요] */
export const groupOfType = (name: string) => (/부활절|맥추|추수|성탄/.test(name) ? "절기헌금" : /신년|기관/.test(name) ? "기타헌금" : "일반헌금");
const GROUP_ORDER = ["일반헌금", "절기헌금", "기타헌금"];

/** 특별헌금 지출을 어느 구분 줄에 넣을지: 항목·부서 이름에 구분 이름의 앞 두 글자가 들어 있으면 그 줄 [확인 필요] */
export const specialLineOf = (names: string[], text: string) => names.find((n) => text.includes(n.replace(/\(.*\)|헌금$/g, "").slice(0, 2))) ?? null;

export function ledger(p: LedgerInput): Ledger {
  const withFee = p.withFee ?? true;
  const typeOf = new Map(p.types.map((t) => [t.id, t]));
  /** 하위 구분(범사/기타/일천번제)은 상위(감사헌금)로 합친다 */
  const topOf = (id: number) => { const t = typeOf.get(id); return t?.parentId != null && typeOf.has(t.parentId) ? typeOf.get(t.parentId)! : t ?? null; };
  const incByTop = new Map<number, number>();
  p.income.forEach((r) => { const t = topOf(r.offeringTypeId); if (t) incByTop.set(t.id, (incByTop.get(t.id) ?? 0) + r.amount); });
  const budgetByTop = new Map<number, number>();
  p.budgets.forEach((b) => { if (b.offeringTypeId == null) return; const t = topOf(b.offeringTypeId); if (t) budgetByTop.set(t.id, (budgetByTop.get(t.id) ?? 0) + b.amount); });
  const budgetByItem = new Map<number, number>();
  p.budgets.forEach((b) => { if (b.expenseItemId != null) budgetByItem.set(b.expenseItemId, (budgetByItem.get(b.expenseItemId) ?? 0) + b.amount); });
  const expByItem = new Map<number, number>();
  p.expense.forEach((r) => expByItem.set(r.expenseItemId, (expByItem.get(r.expenseItemId) ?? 0) + r.amount + (withFee ? r.fee : 0)));

  const tops = p.types.filter((t) => t.parentId == null || !typeOf.has(t.parentId)).sort((a, b) => a.order - b.order || a.id - b.id);
  const incOf = (f: Fund) => sum(tops.filter((t) => t.fund === f), (t) => incByTop.get(t.id) ?? 0);
  const budgetOf = (f: Fund) => sum(tops.filter((t) => t.fund === f), (t) => budgetByTop.get(t.id) ?? 0);
  const expOf = (f: Fund) => sum(p.items.filter((i) => i.fund === f), (i) => expByItem.get(i.id) ?? 0);
  const trOf = (f: Fund) => sum(p.transfers.filter((t) => t.to === f), (t) => t.amount) - sum(p.transfers.filter((t) => t.from === f), (t) => t.amount);

  const line = (label: string, fs: Fund[]): SummaryRow => {
    const budget = sum(fs, budgetOf), carry = sum(fs, (f) => p.carry[f] ?? 0), income = sum(fs, incOf), expense = sum(fs, expOf), transfer = sum(fs, trOf);
    return { label, budget, carry, income, total: carry + income, expense, transfer, balance: carry + income - expense + transfer };
  };
  const summaryRows = [line("일반헌금", ["일반"]), line("특별헌금", ["특별"])];

  // ■ 일반헌금 수입: 구분별(묶음 순서 → 구분 순서), 지출: 부서별
  const incomeRows: RateRow[] = tops.filter((t) => t.fund === "일반")
    .map((t) => ({ group: groupOfType(t.name), name: t.name, budget: budgetByTop.get(t.id) ?? 0, actual: incByTop.get(t.id) ?? 0, rate: 0 as number | null }))
    .filter((r) => r.budget || r.actual)
    .map((r) => ({ ...r, rate: rate(r.actual, r.budget) }))
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  const depts: RateRow[] = [];
  for (const it of [...p.items].filter((i) => i.fund !== "별도").sort((a, b) => a.deptOrder - b.deptOrder || a.id - b.id)) {
    let d = depts.find((x) => x.name === it.dept);
    if (!d) depts.push((d = { group: "지출", name: it.dept, budget: 0, actual: 0, rate: null }));
    d.budget += budgetByItem.get(it.id) ?? 0; d.actual += expByItem.get(it.id) ?? 0;
  }
  depts.forEach((d) => (d.rate = rate(d.actual, d.budget)));
  const totalOf = (rows: RateRow[]): RateRow => { const budget = sum(rows, (r) => r.budget), actual = sum(rows, (r) => r.actual); return { group: "", name: "합계", budget, actual, rate: rate(actual, budget) }; };

  // ■ 특별헌금: 구분별 이월·수입·지출·잔액. 지출은 항목·부서 이름으로 구분 줄을 찾고, 못 찾으면 '기타'
  const specialTypes = tops.filter((t) => t.fund === "특별");
  const names = specialTypes.map((t) => t.name);
  const spRows: SpecialRow[] = specialTypes.map((t) => ({ name: t.name, carry: p.typeCarry.get(t.id) ?? 0, income: incByTop.get(t.id) ?? 0, expense: 0, balance: 0 }));
  let spOther = 0;
  for (const it of p.items.filter((i) => i.fund === "특별")) {
    const amt = expByItem.get(it.id) ?? 0;
    if (!amt) continue;
    const n = specialLineOf(names, `${it.dept} ${it.item}`);
    const row = n ? spRows.find((r) => r.name === n) : null;
    if (row) row.expense += amt; else spOther += amt;
  }
  if (spOther) spRows.push({ name: "기타(구분 못 찾음)", carry: 0, income: 0, expense: spOther, balance: 0 });
  spRows.forEach((r) => (r.balance = r.carry + r.income - r.expense));
  const spTotal: SpecialRow = { name: "합 계", carry: sum(spRows, (r) => r.carry), income: sum(spRows, (r) => r.income), expense: sum(spRows, (r) => r.expense), balance: 0 };
  spTotal.balance = spTotal.carry + spTotal.income - spTotal.expense;

  const sepCarry = p.carry["별도"] ?? 0, sepIn = incOf("별도"), sepOut = expOf("별도");
  return {
    year: p.year, sunday: p.sunday,
    summary: { rows: summaryRows, total: line("총계", ["일반", "특별"]) },
    general: { income: { total: totalOf(incomeRows), rows: incomeRows }, expense: { total: totalOf(depts), rows: depts } },
    special: { rows: spRows, total: spTotal },
    loans: { rows: p.loans, total: sum(p.loans, (l) => l.principal) },
    separate: { name: "해외선교헌금 + 네팔 구호 헌금", carry: sepCarry, income: sepIn, expense: sepOut, balance: sepCarry + sepIn - sepOut + trOf("별도") },
  };
}

/** 결재란 기본 직함 (원본 '총' 시트) */
export const LEDGER_TITLES = ["재정부장", "출납회계", "기장회계"];
export const LEDGER_TITLE_KEY = "ledger_approval_titles";
