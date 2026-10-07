// 보고서 화면 DB 읽기 (Supabase). 집계 뷰(0016)와 기준정보를 읽어 common.ts 모양으로 바꾼다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fundOf, type ExpWeek, type IncWeek } from "./common";
import type { BudgetRow, FundSettle, ItemRef, OtRef } from "./budget";
import type { PayeeActivity } from "./dashboard";
import type { ExpenseDetail } from "./reportData";

type Res<T> = { data: T[] | null; error: { message: string } | null };
/** 한 번에 1000행 제한이 있어 끝까지 나눠 읽는다 */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Res<T>>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}
const must = <T,>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw r.error; return r.data as T; };

type VInc = { sunday: string; offering_type: string; type_order: number | null; fund_kind: string; amount: number };
export async function loadIncWeeks(sb: SupabaseClient, fromYear: number, toYear: number): Promise<IncWeek[]> {
  const rows = await fetchAll<VInc>((a, b) => sb.from("v_income_week").select("sunday, offering_type, type_order, fund_kind, amount")
    .gte("year", fromYear).lte("year", toYear).order("sunday").order("offering_type_id").range(a, b));
  return rows.map((r) => ({ sunday: r.sunday, type: r.offering_type, typeOrder: r.type_order ?? 0, fund: fundOf(r.fund_kind), amount: Number(r.amount) }));
}

type VExp = { sunday: string; department: string | null; dept_order: number | null; item: string; item_order: number | null; fund_kind: string; amount: number };
export async function loadExpWeeks(sb: SupabaseClient, fromYear: number, toYear: number): Promise<ExpWeek[]> {
  const rows = await fetchAll<VExp>((a, b) => sb.from("v_expense_week").select("sunday, department, dept_order, item, item_order, fund_kind, amount")
    .gte("year", fromYear).lte("year", toYear).order("sunday").order("expense_item_id").range(a, b));
  return rows.map((r) => ({ sunday: r.sunday, dept: r.department ?? "(부서 없음)", deptOrder: r.dept_order ?? 99, item: r.item, itemOrder: r.item_order ?? 0, fund: fundOf(r.fund_kind), amount: Number(r.amount) }));
}

/** 지출 건별 (재직회 상세·해외선교 원장) */
type VExpRow = { sunday: string; department: string | null; item: string; fund_kind: string; content: string; amount: number; memo: string | null };
export async function loadExpenseDetail(sb: SupabaseClient, year: number): Promise<ExpenseDetail[]> {
  const rows = await fetchAll<VExpRow>((a, b) => sb.from("v_expense").select("sunday, department, item, fund_kind, content, amount, memo")
    .eq("year", year).order("sunday").order("id").range(a, b));
  return rows.map((r) => ({ date: r.sunday, dept: r.department ?? "(부서 없음)", item: r.item, fund: fundOf(r.fund_kind), content: r.content, amount: Number(r.amount), memo: r.memo ?? "" }));
}

/** 헌금구분·지출항목 기준정보 (비활성 헌금구분도 예산·실적이 있을 수 있어 모두) */
export async function loadRefs(sb: SupabaseClient): Promise<{ types: OtRef[]; items: ItemRef[] }> {
  const [ot, it] = await Promise.all([
    sb.from("offering_type").select("id, name, sort_order, fund(kind)").order("sort_order"),
    sb.from("expense_item").select("id, name, sort_order, fund(kind), department(name, sort_order)").order("sort_order"),
  ]);
  type O = { id: number; name: string; sort_order: number | null; fund: { kind: string } | null };
  type I = { id: number; name: string; sort_order: number | null; fund: { kind: string } | null; department: { name: string; sort_order: number | null } | null };
  return {
    types: (must(ot) as unknown as O[]).map((r) => ({ id: r.id, name: r.name, fund: fundOf(r.fund?.kind), order: r.sort_order ?? 0 })),
    items: (must(it) as unknown as I[]).map((r) => ({ id: r.id, dept: r.department?.name ?? "(부서 없음)", deptOrder: r.department?.sort_order ?? 99, item: r.name, itemOrder: r.sort_order ?? 0, fund: fundOf(r.fund?.kind) })),
  };
}

export async function loadBudgets(sb: SupabaseClient, year: number): Promise<BudgetRow[]> {
  const rows = must(await sb.from("budget").select("offering_type_id, expense_item_id, amount").eq("year", year)) as { offering_type_id: number | null; expense_item_id: number | null; amount: number }[];
  return rows.map((r) => ({ offeringTypeId: r.offering_type_id, expenseItemId: r.expense_item_id, amount: Number(r.amount) }));
}

export type FundRef = { id: number; code: string; name: string; kind: string };
export async function loadFunds(sb: SupabaseClient): Promise<FundRef[]> {
  return must(await sb.from("fund").select("id, code, name, kind").order("id")) as FundRef[];
}

/** 연도별 이월금: fund_id → 금액 */
export async function loadCarry(sb: SupabaseClient, year: number): Promise<Map<number, number>> {
  const rows = must(await sb.from("carryover").select("fund_id, amount").eq("year", year)) as { fund_id: number; amount: number }[];
  return new Map(rows.map((r) => [r.fund_id, Number(r.amount)]));
}

/** 별도 기금(해외선교·네팔) 이월금 합계 */
export const separateCarry = (funds: FundRef[], carry: Map<number, number>) =>
  funds.filter((f) => f.kind === "separate").reduce((s, f) => s + (carry.get(f.id) ?? 0), 0);
/** 일반·특별 기금 이월금 합계 */
export const operatingCarry = (funds: FundRef[], carry: Map<number, number>) =>
  funds.filter((f) => f.kind !== "separate").reduce((s, f) => s + (carry.get(f.id) ?? 0), 0);

export async function saveCarry(sb: SupabaseClient, year: number, fundId: number, amount: number) {
  must(await sb.from("carryover").upsert({ year, fund_id: fundId, amount }, { onConflict: "year,fund_id" }).select("year"));
}

type FS = { fund_id: number; fund_code: string; fund_name: string; fund_kind: string; carry: number; income: number; expense: number; transfer_in: number; transfer_out: number; next_carry: number };
export async function loadFundSettlement(sb: SupabaseClient, year: number): Promise<FundSettle[]> {
  const rows = must(await sb.rpc("fund_settlement", { p_year: year })) as FS[];
  return rows.map((r) => ({ fundId: r.fund_id, code: r.fund_code, name: r.fund_name, kind: r.fund_kind, carry: Number(r.carry), income: Number(r.income), expense: Number(r.expense), transferIn: Number(r.transfer_in), transferOut: Number(r.transfer_out), next: Number(r.next_carry) }));
}

/** 결산 확정 기록(app_setting settlement_{연도}) */
export async function loadSettleMark(sb: SupabaseClient, year: number): Promise<string | null> {
  const r = must(await sb.from("app_setting").select("value").eq("key", `settlement_${year}`).maybeSingle()) as { value: { closed_at?: string } } | null;
  return r?.value?.closed_at ?? null;
}

type VPayee = { payee_id: number; payee_name: string; bank: string | null; account_mask: string | null; first_sunday: string; last_sunday: string; cnt: number; total: number };
export async function loadPayees(sb: SupabaseClient): Promise<PayeeActivity[]> {
  const rows = await fetchAll<VPayee>((a, b) => sb.from("v_payee_activity").select("*").order("last_sunday", { ascending: false }).order("payee_id").range(a, b));
  return rows.map((r) => ({ payeeId: r.payee_id, name: r.payee_name, bank: r.bank, account: r.account_mask, first: r.first_sunday, last: r.last_sunday, cnt: r.cnt, total: Number(r.total) }));
}

/** 승인된 예산 신청 */
export async function loadApprovedRequests(sb: SupabaseClient, year: number) {
  const rows = must(await sb.from("budget_request").select("expense_item_id, amount").eq("year", year).eq("status", "approved")) as { expense_item_id: number | null; amount: number }[];
  return rows.map((r) => ({ expenseItemId: r.expense_item_id, amount: Number(r.amount) }));
}

/** 재직회·감사보고서용 한 해 데이터 */
export async function loadYearReport(sb: SupabaseClient, year: number) {
  const [refs, budgets, inc, prevInc, prevExp, detail, funds, carry] = await Promise.all([
    loadRefs(sb), loadBudgets(sb, year), loadIncWeeks(sb, year, year), loadIncWeeks(sb, year - 1, year - 1), loadExpWeeks(sb, year - 1, year - 1),
    loadExpenseDetail(sb, year), loadFunds(sb), loadCarry(sb, year),
  ]);
  return { ...refs, budgets, inc, prevInc, prevExp, detail, missionCarry: separateCarry(funds, carry) };
}
export type YearReport = Awaited<ReturnType<typeof loadYearReport>>;
