// DB 행 → 재직회·감사보고서 계산 함수(officersReport·auditReport)가 받는 모양으로 바꾸기
import type { BudgetItem, ExpenseTx } from "../officersReport";
import type { IncomeBudget, IncomeTx } from "../auditReport";
import { budgetOfItem, budgetOfType, sortItems, sortTypes, type BudgetRow, type ItemRef, type OtRef } from "./budget";
import type { IncWeek } from "./common";

/** 부서·항목 예산 (일반·특별만. 해외선교 등 별도 기금은 따로 보고) — 예산 없는 항목도 줄을 만든다 */
export const toBudgetItems = (items: ItemRef[], budgets: BudgetRow[]): BudgetItem[] => {
  const b = budgetOfItem(budgets);
  return sortItems(items).filter((i) => i.fund !== "별도").map((i) => ({ dept: i.dept, item: i.item, budget: b.get(i.id) ?? 0 }));
};

/** 헌금구분 예산 (별도 기금 포함, 감사보고서가 나눠 보여준다) */
export const toIncomeBudgets = (types: OtRef[], budgets: BudgetRow[]): IncomeBudget[] => {
  const b = budgetOfType(budgets);
  return sortTypes(types).map((t) => ({ fund: t.fund, type: t.name, budget: b.get(t.id) ?? 0 }));
};

/** 주별 헌금 합계 → 수입 거래(날짜 = 주일) */
export const toIncomeTx = (xs: IncWeek[]): IncomeTx[] => xs.map((r) => ({ date: r.sunday, fund: r.fund, type: r.type, amount: r.amount }));

/** v_expense 건별 행 → 지출 거래 */
export type ExpenseDetail = { date: string; dept: string; item: string; fund: IncWeek["fund"]; content: string; amount: number; memo: string };
export const toExpenseTx = (xs: ExpenseDetail[]): ExpenseTx[] =>
  xs.filter((r) => r.fund !== "별도").map((r) => ({ date: r.date, dept: r.dept, item: r.item, content: r.content, amount: r.amount, memo: r.memo }));
