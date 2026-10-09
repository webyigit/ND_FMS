// 지출 모듈 DB 읽기 도우미
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromFundRows, type FundBalanceRow } from "./report";

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** 1,000행 제한을 넘는 조회: range 로 끝까지 읽는다. make(from, to) 는 매번 새 쿼리를 만들어야 한다 */
export async function fetchAll<T>(make: (from: number, to: number) => Page<T>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await make(from, from + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

export async function loadFundBalances(sb: SupabaseClient, sunday: string) {
  const { data, error } = await sb.rpc("fund_balances", { p_sunday: sunday });
  if (error) throw error;
  return fromFundRows((data ?? []) as FundBalanceRow[]);
}

/** 결재란 직함 (app_setting 'approval_titles' = 지출 보고, 'income_approval_titles' = 주일 헌금 현황) */
export const DEFAULT_TITLES = ["담당", "기장회계", "출납회계", "재정부장"];
/** 원본 'MM-DD_주일헌금현황' 결재란 */
export const INCOME_TITLES = ["기장회계", "재정부장", "당회장"];
export async function loadTitles(sb: SupabaseClient, key = "approval_titles", fallback = DEFAULT_TITLES): Promise<string[]> {
  const { data, error } = await sb.from("app_setting").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  const v = data?.value;
  return Array.isArray(v) && v.length && v.every((x) => typeof x === "string") ? v : fallback;
}
export async function saveTitles(sb: SupabaseClient, titles: string[], key = "approval_titles") {
  const { error } = await sb.from("app_setting")
    .upsert({ key, value: titles, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

/** 지금 로그인한 사람이 관리자인지 */
export async function isAdmin(sb: SupabaseClient) {
  const { data } = await sb.rpc("my_role");
  return data === "admin";
}
