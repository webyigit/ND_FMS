// 총계원장 DB 읽기: 기준정보·예산·이월·올해 누계(기준 주일까지)·대체·차입
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "../reports/load";
import type { BudgetRow, Fund, ItemRef, Loan, TypeRef, Transfer } from "./general";

const FUND: Record<string, Fund> = { general: "일반", special: "특별", separate: "별도" };
const fundOf = (k: string | null | undefined): Fund => FUND[k ?? "general"] ?? "일반";
const must = <T,>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw r.error; return r.data as T; };

export async function loadLedgerInput(sb: SupabaseClient, sunday: string) {
  const year = Number(sunday.slice(0, 4));
  type O = { id: number; name: string; parent_id: number | null; sort_order: number | null; fund: { kind: string } | null };
  type I = { id: number; name: string; fund: { kind: string } | null; department: { name: string; sort_order: number | null } | null };
  type B = { offering_type_id: number | null; expense_item_id: number | null; amount: number };
  type F = { id: number; kind: string };
  type C = { fund_id: number; amount: number };
  type TC = { offering_type_id: number; amount: number };
  type Inc = { offering_type_id: number; amount: number };
  type Exp = { expense_item_id: number; amount: number; fee: number | null };
  type Tr = { from_fund: number; to_fund: number; amount: number; week: { sunday: string } | null };
  type L = { lender: string | null; principal: number | null };
  const [ot, it, budgets, funds, carry, typeCarry, inc, exp, tr, loans, church, titles] = await Promise.all([
    sb.from("offering_type").select("id, name, parent_id, sort_order, fund(kind)").order("sort_order").then((r) => must(r) as unknown as O[]),
    sb.from("expense_item").select("id, name, fund(kind), department(name, sort_order)").order("sort_order").then((r) => must(r) as unknown as I[]),
    sb.from("budget").select("offering_type_id, expense_item_id, amount").eq("year", year).then((r) => must(r) as B[]),
    sb.from("fund").select("id, kind").then((r) => must(r) as F[]),
    sb.from("carryover").select("fund_id, amount").eq("year", year).then((r) => must(r) as C[]),
    sb.from("offering_carryover").select("offering_type_id, amount").eq("year", year).then((r) => must(r) as TC[]),
    fetchAll<Inc>((a, b) => sb.from("v_income_week").select("offering_type_id, amount").eq("year", year).lte("sunday", sunday).order("sunday").order("offering_type_id").range(a, b)),
    fetchAll<Exp>((a, b) => sb.from("v_expense_week").select("expense_item_id, amount, fee").eq("year", year).lte("sunday", sunday).order("sunday").order("expense_item_id").range(a, b)),
    sb.from("fund_transfer").select("from_fund, to_fund, amount, week!inner(sunday)").eq("week.year", year).lte("week.sunday", sunday).then((r) => must(r) as unknown as Tr[]),
    sb.from("loan").select("lender, principal").order("id").then((r) => must(r) as L[]),
    sb.from("church_info").select("name").eq("id", 1).maybeSingle().then((r) => (r.data as { name: string | null } | null)?.name ?? null),
    sb.from("app_setting").select("value").eq("key", "ledger_approval_titles").maybeSingle().then((r) => (r.data?.value as unknown) ?? null),
  ]);
  const fundKind = new Map(funds.map((f) => [f.id, fundOf(f.kind)]));
  const carryByFund: Record<Fund, number> = { 일반: 0, 특별: 0, 별도: 0 };
  carry.forEach((c) => { const k = fundKind.get(c.fund_id); if (k) carryByFund[k] += Number(c.amount); });
  const types: TypeRef[] = ot.map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id, order: r.sort_order ?? 0, fund: fundOf(r.fund?.kind) }));
  const items: ItemRef[] = it.map((r) => ({ id: r.id, dept: r.department?.name ?? "(부서 없음)", deptOrder: r.department?.sort_order ?? 99, item: r.name, fund: fundOf(r.fund?.kind) }));
  return {
    year, sunday, types, items,
    budgets: budgets.map((b): BudgetRow => ({ offeringTypeId: b.offering_type_id, expenseItemId: b.expense_item_id, amount: Number(b.amount) })),
    carry: carryByFund,
    typeCarry: new Map(typeCarry.map((t) => [t.offering_type_id, Number(t.amount)])),
    income: inc.map((r) => ({ offeringTypeId: r.offering_type_id, amount: Number(r.amount) })),
    expense: exp.map((r) => ({ expenseItemId: r.expense_item_id, amount: Number(r.amount), fee: Number(r.fee ?? 0) })),
    transfers: tr.map((t): Transfer => ({ from: fundKind.get(t.from_fund) ?? "일반", to: fundKind.get(t.to_fund) ?? "일반", amount: Number(t.amount) })),
    loans: loans.map((l): Loan => ({ lender: l.lender ?? "차입", principal: Number(l.principal ?? 0) })),
    churchName: church?.trim() || "남도교회",
    titles: Array.isArray(titles) && titles.length && titles.every((x) => typeof x === "string") ? (titles as string[]) : null,
  };
}

/** 특별헌금 구분별 전년이월 저장 (총계원장 '■ 특별헌금' 표) */
export async function saveTypeCarry(sb: SupabaseClient, year: number, rows: { offeringTypeId: number; amount: number }[]) {
  const { error } = await sb.from("offering_carryover")
    .upsert(rows.map((r) => ({ year, offering_type_id: r.offeringTypeId, amount: r.amount })), { onConflict: "year,offering_type_id" });
  if (error) throw error;
}
