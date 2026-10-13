// 고정지출관리: 입력 확인과 정렬
export type FixedForm = { weekOfMonth: number; content: string; amount: number; expenseItemId: number | null; payeeId: number | null; memo: string; active: boolean };

export const emptyFixed = (): FixedForm => ({ weekOfMonth: 1, content: "", amount: 0, expenseItemId: null, payeeId: null, memo: "", active: true });

/** 저장 전에 고칠 것 */
export function fixedProblems(f: FixedForm): string[] {
  return [
    !(f.weekOfMonth >= 1 && f.weekOfMonth <= 5) && "N째 주(1~5)",
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

/** 고정지출 불러오기: 이미 들어간(고정·같은 내용·부서·항목) 항목은 빼고 새 것만 */
type FixedLike = { content: string; dept: string; item: string };
const fixedKey = (x: FixedLike) => `${x.content.trim()}\u0000${x.dept}\u0000${x.item}`;
export function newFixedOnly<T extends FixedLike>(fixed: T[], rows: (FixedLike & { source: string })[]) {
  const have = new Set(rows.filter((r) => r.source === "고정").map(fixedKey));
  const add = fixed.filter((f) => !have.has(fixedKey(f)));
  return { add, dup: fixed.length - add.length };
}
