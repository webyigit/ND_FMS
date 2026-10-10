// 고정지출관리: 입력 확인과 정렬
export type FixedForm = { weekOfMonth: number; content: string; amount: number; expenseItemId: number | null; payeeId: number | null; memo: string; active: boolean };

export const emptyFixed = (): FixedForm => ({ weekOfMonth: 1, content: "", amount: 0, expenseItemId: null, payeeId: null, memo: "", active: true });

/** 저장 전에 고칠 것 */
export function fixedProblems(f: FixedForm): string[] {
  return [
    !(f.weekOfMonth >= 1 && f.weekOfMonth <= 5) && "주차(1~5)",
    !f.content.trim() && "내용",
    !(f.amount > 0) && "금액",
    !f.expenseItemId && "부서·항목",
  ].filter((x): x is string => !!x);
}

export const toFixedRow = (f: FixedForm) => ({
  week_of_month: f.weekOfMonth, content: f.content.trim(), amount: f.amount, expense_item_id: f.expenseItemId,
  payee_id: f.payeeId, memo: f.memo.trim() || null, active: f.active,
});

/** 주차 → 사용 중 먼저 → 내용 */
export function sortFixed<T extends { weekOfMonth: number; active: boolean; content: string }>(xs: T[]) {
  return [...xs].sort((a, b) => a.weekOfMonth - b.weekOfMonth || Number(b.active) - Number(a.active) || a.content.localeCompare(b.content, "ko"));
}
