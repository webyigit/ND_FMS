// 신청(지출·예산)과 부서 예산 집계: 화면에서 쓰는 순수 계산
export type RequestStatus = "requested" | "approved" | "rejected" | "done";
export const STATUS: Record<RequestStatus, [string, string]> = {
  requested: ["검토 중", "bg-warning-subtle text-warning"],
  approved: ["승인", "bg-success-subtle text-success"],
  rejected: ["반려", "bg-danger-subtle text-danger"],
  done: ["완료", "bg-surface-2 text-label"],
};
export const statusLabel = (s: string) => STATUS[s as RequestStatus]?.[0] ?? s;

/** 승인 전 건만 고치거나 지울 수 있다 */
export const editable = (s: string) => s === "requested";

export type ExpenseForm = { departmentId: number | null; content: string; amount: number; usedAt: string; bank: string; accountNo: string; holder: string };

/** 신청 전 확인. needDept: 부서장은 부서를 골라야 한다. hasSavedAccount: 저장된 계좌가 있으면 계좌 칸을 비워도 된다 */
export function expenseFormProblems(f: ExpenseForm, opt: { needDept: boolean; today?: string }): string[] {
  const out: string[] = [];
  if (opt.needDept && !f.departmentId) out.push("부서를 골라 주세요");
  if (!f.content.trim()) out.push("내용을 입력해 주세요");
  if (!(f.amount > 0)) out.push("금액을 입력해 주세요");
  if (f.usedAt && opt.today && f.usedAt > opt.today) out.push("사용일이 오늘보다 뒤예요");
  const digits = f.accountNo.replace(/\D/g, "");
  if (f.accountNo.trim()) {
    if (digits.length < 8) out.push("계좌번호를 확인해 주세요");
    if (!f.bank.trim()) out.push("은행을 입력해 주세요");
  }
  return out;
}

export type BudgetRow = { department_id: number; department: string; expense_item_id: number; item: string; budget: number; spent: number };
export type DeptSummary = { id: number; name: string; budget: number; spent: number; balance: number; rate: number | null; items: BudgetRow[] };

/** 항목별 예산·지출 → 부서별 합계(잔액·집행률). 집행률은 예산이 0이면 null */
export function summarizeBudget(rows: BudgetRow[]): DeptSummary[] {
  const map = new Map<number, DeptSummary>();
  for (const r of rows) {
    const d = map.get(r.department_id) ?? { id: r.department_id, name: r.department, budget: 0, spent: 0, balance: 0, rate: null, items: [] };
    const row = { ...r, budget: Number(r.budget), spent: Number(r.spent) };
    d.budget += row.budget;
    d.spent += row.spent;
    d.items.push(row);
    map.set(r.department_id, d);
  }
  return [...map.values()].map((d) => ({ ...d, balance: d.budget - d.spent, rate: d.budget ? d.spent / d.budget : null }));
}

/** 집행률 표시용 막대 폭(0~100) */
export const barWidth = (rate: number | null) => (rate == null ? 0 : Math.max(0, Math.min(100, Math.round(rate * 100))));

export type DeptItems = { id: number; name: string; items: { id: number; name: string }[] };
export type ItemRow = { id: number; name: string; sort_order: number | null; department: { id: number; name: string; sort_order: number | null } | null };

/** 항목 목록 → 부서별 묶음 (부서·항목 순서대로) */
export function groupItems(rows: ItemRow[]): DeptItems[] {
  const sorted = [...rows].sort((a, b) => (a.department?.sort_order ?? 0) - (b.department?.sort_order ?? 0)
    || (a.department?.id ?? 0) - (b.department?.id ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
  const out: DeptItems[] = [];
  for (const r of sorted) {
    const dep = r.department;
    if (!dep) continue;
    let d = out.find((x) => x.id === dep.id);
    if (!d) out.push((d = { id: dep.id, name: dep.name, items: [] }));
    d.items.push({ id: r.id, name: r.name });
  }
  return out;
}
