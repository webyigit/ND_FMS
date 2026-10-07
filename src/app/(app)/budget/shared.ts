// 결산·예산 화면 공통: 데이터 읽기와 표 스타일
import type { SupabaseClient } from "@supabase/supabase-js";
import { settleExpense, settleIncome } from "@/lib/reports/budget";
import { loadBudgets, loadExpWeeks, loadFundSettlement, loadIncWeeks, loadRefs, loadSettleMark } from "@/lib/reports/load";

export const th = "border border-line bg-surface-2 px-2 py-1.5 text-center font-semibold";
export const td = "border border-line px-2 py-1";
export const tdr = `${td} text-right`;
/** 예산 대비 비율 (예산 0이면 -) */
export const rate = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "-");

/** 한 해 결산: 예산 대비 수입·지출, 기금별 이월. withNext면 다음 연도 예산도 */
export async function loadSettlement(sb: SupabaseClient, year: number, withNext = false) {
  const [refs, budgets, nextBudgets, inc, exp, funds, closedAt, role] = await Promise.all([
    loadRefs(sb), loadBudgets(sb, year), withNext ? loadBudgets(sb, year + 1) : Promise.resolve([]),
    loadIncWeeks(sb, year, year), loadExpWeeks(sb, year, year), loadFundSettlement(sb, year), loadSettleMark(sb, year),
    sb.rpc("my_role").then((r) => (r.data as string | null) ?? null),
  ]);
  return {
    income: settleIncome(refs.types, budgets, inc, year),
    expense: settleExpense(refs.items, budgets, exp, year),
    nextIncome: settleIncome(refs.types, nextBudgets, [], year + 1),
    nextExpense: settleExpense(refs.items, nextBudgets, [], year + 1),
    funds, closedAt, isAdmin: role === "admin",
  };
}
export type Settlement = Awaited<ReturnType<typeof loadSettlement>>;
