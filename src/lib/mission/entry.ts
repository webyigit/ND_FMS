// 해외선교(별도 기금) 입력: 그 주일 전체 입력 중 해외선교 몫만 고치고, 저장할 때는 방금 DB에서 다시 읽은
// 나머지(일반·특별) 행과 합쳐 주간 저장 함수에 넘긴다. 다른 화면이 넣은 일반·특별 입력을 지우지 않게.
import type { ExpenseRow, IncomeEntry } from "../db/weekly";

/** 지출입력의 해외선교 부서 이름 (0016_reports.sql) */
export const MISSION_DEPT = "해외선교";

export const isMissionIncome = (sepTypeIds: number[]) => (e: IncomeEntry) => sepTypeIds.includes(e.typeId);
export const isMissionExpense = (r: ExpenseRow) => r.dept === MISSION_DEPT;

/** 저장할 전체 행 = 최신 DB의 해외선교 아닌 행 + 이 화면의 해외선교 행 */
export function mergeIncome(fresh: IncomeEntry[], mine: IncomeEntry[], sepTypeIds: number[]): IncomeEntry[] {
  const mission = isMissionIncome(sepTypeIds);
  return [...fresh.filter((e) => !mission(e)), ...mine.filter(mission)];
}

export function mergeExpense(fresh: ExpenseRow[], mine: ExpenseRow[]): ExpenseRow[] {
  return [...fresh.filter((r) => !isMissionExpense(r)), ...mine.filter(isMissionExpense)];
}

/** 헌금구분별 합계 (화면 아래 요약) */
export function incomeTotals(xs: IncomeEntry[], types: { id: number; name: string }[]) {
  return types.map((t) => ({ ...t, count: xs.filter((e) => e.typeId === t.id).length, total: xs.filter((e) => e.typeId === t.id).reduce((s, e) => s + e.amount, 0) }));
}
