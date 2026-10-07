"use client";
// 로그인한 회원(이름·권한)과 부서·항목. 보이는 범위는 DB 권한이 정한다(부서장: 연결된 부서, 재정부원: 전체).
import { useDbQuery, must } from "@/lib/db/useDb";
import { groupItems, type DeptItems, type ItemRow } from "./requests";

export type MeInfo = { id: string; name: string; status: string; role: string } | null;

export function useMe() {
  return useDbQuery<MeInfo>(async (sb) => {
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;
    return must(await sb.from("app_user").select("id, name, status, role").eq("id", data.user.id).maybeSingle()) as MeInfo;
  }, []);
}

/** 부서 → 항목 */
export function useDeptItems() {
  return useDbQuery<DeptItems[]>(async (sb) =>
    groupItems(must(await sb.from("expense_item").select("id, name, sort_order, department(id, name, sort_order)")) as unknown as ItemRow[]), []);
}
