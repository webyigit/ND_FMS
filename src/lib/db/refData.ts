"use client";
// 입력 화면 공통 기준정보(헌금구분·교인·부서/항목·고정지출). DB가 없으면 데모 데이터.
import { useEffect, useState } from "react";
import { DEPARTMENTS, FIXED_EXPENSES, MEMBERS, OFFERING_TYPES, type FixedExpense, type Member, type OfferingType } from "../demo";
import { supabaseBrowser } from "../supabase/client";
import { cacheGet, cacheSet } from "../offline/cache";
import { isNetworkError } from "../offline/logic";

export type RefData = {
  demo: boolean;
  offeringTypes: OfferingType[];
  members: Member[];
  departments: Record<string, string[]>;
  fixedExpenses: FixedExpense[];
};

export const DEMO_REF: RefData = { demo: true, offeringTypes: OFFERING_TYPES, members: MEMBERS, departments: DEPARTMENTS, fixedExpenses: FIXED_EXPENSES };

const FUND: Record<string, OfferingType["fund"]> = { general: "일반", special: "특별", separate: "별도" };

type OtRow = { id: number; name: string; total_only: boolean | null; amount_unit: number | null; has_memo: boolean | null; fund: { kind: string } | null };
export const mapOfferingType = (r: OtRow): OfferingType => ({
  id: r.id, name: r.name, fund: FUND[r.fund?.kind ?? "general"] ?? "일반",
  ...(r.total_only ? { totalOnly: true } : {}),
  ...((r.amount_unit ?? 1) > 1 ? { unit: r.amount_unit! } : {}),
  ...(r.has_memo ? { hasMemo: true } : {}),
});

type MemberRow = { id: number; name: string; name_suffix: string | null; title: string | null; display_rank: number | null };
export const mapMember = (r: MemberRow): Member => ({
  id: r.id, name: r.name + (r.name_suffix ?? ""),
  ...(r.title ? { title: r.title } : {}),
  ...(r.display_rank != null ? { displayRank: r.display_rank } : {}),
});

type ItemRow = { name: string; department: { name: string; sort_order: number | null } | null };
export function mapDepartments(items: ItemRow[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  items.forEach((i) => { if (i.department) (out[i.department.name] ??= []).push(i.name); });
  return out;
}

type FixedRow = { week_of_month: number; content: string; amount: number; expense_item: ItemRow | null };
export const mapFixed = (r: FixedRow): FixedExpense => ({
  weekOfMonth: r.week_of_month, content: r.content, amount: Number(r.amount),
  dept: r.expense_item?.department?.name ?? "", item: r.expense_item?.name ?? "",
});

async function loadRef(): Promise<RefData> {
  const sb = supabaseBrowser();
  if (!sb) return DEMO_REF;
  const [ot, mem, items, fixed] = await Promise.all([
    sb.from("offering_type").select("id, name, total_only, amount_unit, has_memo, fund(kind)").eq("active", true).order("sort_order"),
    sb.from("member").select("id, name, name_suffix, title, display_rank").eq("active", true).order("name"),
    sb.from("expense_item").select("name, sort_order, department(name, sort_order)").order("sort_order"),
    sb.from("fixed_expense").select("week_of_month, content, amount, expense_item(name, department(name, sort_order))").eq("active", true),
  ]);
  const err = ot.error ?? mem.error ?? items.error ?? fixed.error;
  if (err) throw err;
  const itemRows = (items.data as unknown as (ItemRow & { sort_order: number | null })[])
    .sort((a, b) => (a.department?.sort_order ?? 0) - (b.department?.sort_order ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return {
    demo: false,
    offeringTypes: (ot.data as unknown as OtRow[]).map(mapOfferingType),
    members: (mem.data as MemberRow[]).map(mapMember),
    departments: mapDepartments(itemRows),
    fixedExpenses: (fixed.data as unknown as FixedRow[]).map(mapFixed),
  };
}

/** 온라인이면 서버에서 읽고 기기에 남긴다. 오프라인이면 마지막으로 받은 기준정보를 쓴다 */
async function loadRefOrCached(): Promise<RefData> {
  try {
    const ref = await loadRef();
    void cacheSet("ref", ref);
    return ref;
  } catch (e) {
    const hit = isNetworkError(e) ? await cacheGet<RefData>("ref") : null;
    if (hit) return hit.data;
    throw isNetworkError(e) ? new Error("오프라인이에요. 기준정보를 한 번은 온라인에서 받아야 해요.") : e;
  }
}

let cache: Promise<RefData> | null = null;
/** 기준정보 한 번만 불러와 화면 간 공유. 실패하면 error */
export function useRefData(): { ref: RefData | null; error: string | null } {
  const [state, setState] = useState<{ ref: RefData | null; error: string | null }>({ ref: supabaseBrowser() ? null : DEMO_REF, error: null });
  useEffect(() => {
    if (!supabaseBrowser()) return;
    cache ??= loadRefOrCached();
    cache.then((ref) => setState({ ref, error: null }), (e) => { cache = null; setState({ ref: null, error: e?.message ?? "기준정보를 불러오지 못했어요" }); });
  }, []);
  return state;
}
