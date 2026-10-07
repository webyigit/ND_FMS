// 데모 모드(DB 없음)용: 기존 가상 데이터를 주 단위 집계 모양으로 바꾼다
import { DEMO_EXPENSES, DEMO_INCOME, DEMO_INCOME_BUDGETS, DEMO_BUDGETS } from "../demo";
import { sum, sundayOf, type ExpWeek, type IncWeek } from "./common";

export const demoIncWeeks = (): IncWeek[] => DEMO_INCOME.map((t) => ({ sunday: sundayOf(t.date), type: t.type, fund: t.fund, amount: t.amount }));
export const demoExpWeeks = (): ExpWeek[] => DEMO_EXPENSES.map((t) => ({ sunday: sundayOf(t.date), dept: t.dept, item: t.item, fund: "일반", amount: t.amount }));
export const demoBudgetTotals = () => ({
  income: sum(DEMO_INCOME_BUDGETS.filter((b) => b.fund !== "별도"), (b) => b.budget),
  expense: sum(DEMO_BUDGETS, (b) => b.budget),
});
