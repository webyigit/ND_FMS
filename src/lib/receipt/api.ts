"use client";
// 기부금영수증 DB 읽기·쓰기 (RLS: 재정부원만)
import type { SupabaseClient } from "@supabase/supabase-js";
import { must } from "@/lib/db/useDb";
import type { Detail, IncomeRow } from "./calc";
import type { LedgerRow } from "./ledger";

export type ReceiptView = LedgerRow & {
  id: number; year: number; donation_year: number | null; member_id: number | null; has_rrn: boolean;
  donor_rep_name: string | null; total_amount: number; adjustment_amount: number | null; adjustment_reason: string | null;
  split_group: string | null; split_ratio: number | null; reissue_of_id: number | null; detail: Detail | null;
  memo: string | null; form_id: number | null; request_id: number | null;
};
export const RECEIPT_COLS = "id, year, donation_year, serial_no, donor_kind, member_id, donor_name, donor_rrn_masked, rrn_front, has_rrn, donor_address, donor_brn, donor_rep_name, total_amount, issued_amount, adjustment_amount, adjustment_reason, split_group, split_ratio, status, reissue_of_id, detail, memo, form_id, issued_at, request_id";

export type Church = { name: string | null; pastor: string | null; address: string | null; reg_no: string | null; phone: string | null; seal_image: string | null; stamp_image: string | null };
export async function loadChurch(sb: SupabaseClient): Promise<Church | null> {
  return must(await sb.from("church_info").select("name, pastor, address, reg_no, phone, seal_image, stamp_image").eq("id", 1).maybeSingle()) as Church | null;
}

export type DonorHit = {
  member_id: number; name: string; title: string | null; household_id: number | null; household_label: string | null;
  is_household_head: boolean; address: string | null; phone: string | null; rrn_masked: string | null; family: string[];
};
export async function searchDonors(sb: SupabaseClient, q: string): Promise<DonorHit[]> {
  return must(await sb.rpc("receipt_donor_search", { p_q: q })) as DonorHit[];
}

/** 같은 가족(household) 교인 */
export async function familyOf(sb: SupabaseClient, memberId: number): Promise<{ id: number; name: string }[]> {
  const me = must(await sb.from("member").select("id, name, name_suffix, household_id").eq("id", memberId).maybeSingle()) as { id: number; name: string; name_suffix: string | null; household_id: number | null } | null;
  if (!me) return [];
  if (!me.household_id) return [{ id: me.id, name: me.name + (me.name_suffix ?? "") }];
  const rows = must(await sb.from("member").select("id, name, name_suffix").eq("household_id", me.household_id).order("is_household_head", { ascending: false }).order("id")) as { id: number; name: string; name_suffix: string | null }[];
  return rows.map((r) => ({ id: r.id, name: r.name + (r.name_suffix ?? "") }));
}

const INCOME_COLS = "id, offering_type, type_order, month, member_id, member_name, payer_label, amount";
/**
 * 가족 합산 헌금: 가족 교인으로 입력된 헌금 + 지난 영수증에 묶였던 표기(교인 미연결) + 직접 고른 표기
 */
export async function loadFamilyIncome(sb: SupabaseClient, memberIds: number[], year: number, extraLabels: string[] = []): Promise<(IncomeRow & { id: number })[]> {
  let labels = [...extraLabels];
  if (memberIds.length) {
    const linked = must(await sb.from("donation_receipt_source").select("payer_label, donation_receipt!inner(member_id)").in("donation_receipt.member_id", memberIds)) as { payer_label: string }[];
    labels = [...new Set([...labels, ...linked.map((l) => l.payer_label)])];
  }
  const [a, b] = await Promise.all([
    memberIds.length ? sb.from("v_income").select(INCOME_COLS).eq("year", year).in("member_id", memberIds) : Promise.resolve({ data: [], error: null }),
    labels.length ? sb.from("v_income").select(INCOME_COLS).eq("year", year).is("member_id", null).in("payer_label", labels) : Promise.resolve({ data: [], error: null }),
  ]);
  const rows = [...(must(a) as (IncomeRow & { id: number })[]), ...(must(b) as (IncomeRow & { id: number })[])];
  return [...new Map(rows.map((r) => [r.id, { ...r, amount: Number(r.amount) }])).values()];
}

/** 교인에 연결되지 않은 헌금 표기 찾기(가족 묶음·공동명의 등). 총액 입력은 뺀다. */
export async function searchLabels(sb: SupabaseClient, year: number, q: string): Promise<{ label: string; amount: number }[]> {
  const rows = must(await sb.from("v_income").select("payer_label, amount").eq("year", year).is("member_id", null)
    .ilike("payer_label", `%${q.replace(/[%_]/g, "")}%`).neq("payer_label", "(총액)").limit(500)) as { payer_label: string; amount: number }[];
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(r.payer_label, (m.get(r.payer_label) ?? 0) + Number(r.amount)));
  return [...m].map(([label, amount]) => ({ label, amount })).slice(0, 20);
}

export type IssueRow = {
  donation_year: number; donor_kind: "PN" | "CP"; member_id: number | null; donor_name: string;
  donor_rrn?: string; rrn_from_receipt_id?: number | null; donor_address: string;
  donor_brn?: string; donor_rep_name?: string;
  total_amount: number; issued_amount: number; adjustment_amount: number; adjustment_reason: string;
  split_ratio: number | null; detail: Detail; sources: { payer_label: string; amount: number }[];
  memo: string; form_id?: number | null; request_id?: number | null; reissue_of_id?: number | null;
};
export async function issueReceipts(sb: SupabaseClient, rows: IssueRow[]): Promise<{ id: number; serial_no: string }[]> {
  return must(await sb.rpc("issue_donation_receipts", { p_rows: rows })) as { id: number; serial_no: string }[];
}
export async function updateReceipt(sb: SupabaseClient, id: number, row: Partial<IssueRow>) {
  return must(await sb.rpc("update_donation_receipt", { p_id: id, r: row }));
}
export async function cancelReceipt(sb: SupabaseClient, id: number, reason: string) {
  must(await sb.rpc("cancel_donation_receipt", { p_id: id, p_reason: reason }));
}
/** 출력용 주민번호 전체(사용내역에 남는다) */
export async function fullRrn(sb: SupabaseClient, id: number): Promise<string | null> {
  return must(await sb.rpc("receipt_rrn", { p_id: id })) as string | null;
}
export async function loadReceipts(sb: SupabaseClient, ids: number[]): Promise<ReceiptView[]> {
  return must(await sb.from("v_donation_receipt").select(RECEIPT_COLS).in("id", ids).order("id")) as ReceiptView[];
}
