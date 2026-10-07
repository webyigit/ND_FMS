// 수입·지출 주간 입력 ↔ DB 행 변환과 저장 (Supabase). 화면 상태는 그대로 두고 여기서만 바꾼다.
import type { SupabaseClient } from "@supabase/supabase-js";

export type IncomeEntry = { id: string; typeId: number; channel: "cash" | "online"; memberId: number | null; name: string; amount: number; memo: string };
export type ExpenseSource = "직접" | "고정" | "은행" | "증빙" | "엑셀" | "신청";
export type ExpenseRow = { id: string; content: string; amount: number; dept: string; item: string; requester: string; memo: string; source: ExpenseSource; fileId?: string };

/** DB에서 불러온 행의 id ("db-12" → 12). 새 행은 null → 저장 시 새로 넣는다 */
const dbId = (id: string) => (id.startsWith("db-") ? Number(id.slice(3)) : null);

export const toIncomePayload = (xs: IncomeEntry[]) =>
  xs.map((e) => ({ id: dbId(e.id), offering_type_id: e.typeId, member_id: e.memberId, payer_label: e.name, channel: e.channel, amount: e.amount, memo: e.memo || null }));

export const toExpensePayload = (xs: ExpenseRow[]) =>
  xs.map((r) => ({ id: dbId(r.id), dept: r.dept, item: r.item, content: r.content.trim(), amount: r.amount, requester: r.requester.trim(), memo: r.memo || null, source: r.source, drive_file_id: r.fileId ?? null }));

/** 저장 여부 비교용 서명(화면용 id는 빼고 내용만) */
const noId = <T extends { id: unknown }>({ id: _, ...rest }: T) => rest; // eslint-disable-line @typescript-eslint/no-unused-vars
export const incomeSig = (xs: IncomeEntry[]) => JSON.stringify(toIncomePayload(xs).map(noId));
export const expenseSig = (xs: ExpenseRow[]) => JSON.stringify(toExpensePayload(xs).map(noId));

/** 저장 전에 고쳐야 할 지출 행 (1부터 센 행 번호와 이유) */
export function expenseProblems(xs: ExpenseRow[]): string[] {
  return xs.flatMap((r, i) => {
    const why = [!r.amount && "금액", !r.dept && "부서", !r.item && "항목"].filter(Boolean);
    return why.length ? [`${i + 1}행: ${why.join("·")} 없음`] : [];
  });
}

type IncomeDbRow = { id: number; offering_type_id: number; member_id: number | null; payer_label: string | null; channel: "cash" | "online"; amount: number; memo: string | null };
export const fromIncomeRows = (rows: IncomeDbRow[]): IncomeEntry[] =>
  rows.map((r) => ({ id: `db-${r.id}`, typeId: r.offering_type_id, channel: r.channel, memberId: r.member_id, name: r.payer_label ?? "", amount: Number(r.amount), memo: r.memo ?? "" }));

type ExpenseDbRow = {
  id: number; content: string; amount: number; requester_label: string | null; memo: string | null; source: string | null;
  expense_item: { name: string; department: { name: string } | null } | null;
  receipt_file: { drive_file_id: string | null } | null;
};
const SOURCES: ExpenseSource[] = ["직접", "고정", "은행", "증빙", "엑셀", "신청"];
export const fromExpenseRows = (rows: ExpenseDbRow[]): ExpenseRow[] =>
  rows.map((r) => ({
    id: `db-${r.id}`, content: r.content, amount: Number(r.amount),
    dept: r.expense_item?.department?.name ?? "", item: r.expense_item?.name ?? "",
    requester: r.requester_label ?? "", memo: r.memo ?? "",
    source: SOURCES.includes(r.source as ExpenseSource) ? (r.source as ExpenseSource) : "직접",
    ...(r.receipt_file?.drive_file_id ? { fileId: r.receipt_file.drive_file_id } : {}),
  }));

// 은행거래에서 들어온 행(bank_tx_id 있음)은 은행거래내역 화면에서 다룬다
export async function loadIncome(sb: SupabaseClient, sunday: string) {
  const { data, error } = await sb.from("income")
    .select("id, offering_type_id, member_id, payer_label, channel, amount, memo, week!inner(sunday)")
    .eq("week.sunday", sunday).is("bank_tx_id", null).order("sort_order");
  if (error) throw error;
  return fromIncomeRows(data as unknown as IncomeDbRow[]);
}

export async function loadExpense(sb: SupabaseClient, sunday: string) {
  const { data, error } = await sb.from("expense")
    .select("id, content, amount, requester_label, memo, source, week!inner(sunday), expense_item!expense_expense_item_id_fkey(name, department(name)), receipt_file(drive_file_id)")
    .eq("week.sunday", sunday).is("bank_tx_id", null).order("sort_order");
  if (error) throw error;
  return fromExpenseRows(data as unknown as ExpenseDbRow[]);
}

export async function saveIncome(sb: SupabaseClient, sunday: string, xs: IncomeEntry[]) {
  const { data, error } = await sb.rpc("save_week_income", { p_sunday: sunday, p_rows: toIncomePayload(xs) });
  if (error) throw error;
  return data as number;
}

export async function saveExpense(sb: SupabaseClient, sunday: string, xs: ExpenseRow[]) {
  const { data, error } = await sb.rpc("save_week_expense", { p_sunday: sunday, p_rows: toExpensePayload(xs) });
  if (error) throw error;
  return data as number;
}

/** 화면에 보여줄 오류 문장 */
export const dbError = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "알 수 없는 오류");
