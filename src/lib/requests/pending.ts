"use client";
// 외부에서 들어온 미처리 신청(기부금영수증·지출·예산). 관리자(재정 권한) 화면 상단 팝업·띠에 쓴다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { must } from "../db/useDb";

export type PendingKind = "donation" | "expense" | "budget";
export type PendingItem = {
  kind: PendingKind; id: number; title: string; sub: string; at: string;
  /** 눌렀을 때 바로 이어갈 처리 화면 */
  href: string;
};
export const KIND_LABEL: Record<PendingKind, string> = { donation: "기부금영수증 신청", expense: "지출신청", budget: "예산신청" };
export const SEEN_KEY = "ndfms:pending-seen";
/** 처리 화면이 신청을 끝냈을 때 띄우는 브라우저 이벤트. 팝업·띠가 다시 읽는다 */
export const CHANGED_EVENT = "ndfms:requests-changed";
export const notifyRequestsChanged = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED_EVENT)); };

export const itemKey = (i: Pick<PendingItem, "kind" | "id">) => `${i.kind}:${i.id}`;

/** 이번 브라우저 세션에서 아직 팝업으로 보여주지 않은 신청 */
export function unseen(items: PendingItem[], seen: string[]): PendingItem[] {
  const s = new Set(seen);
  return items.filter((i) => !s.has(itemKey(i)));
}
export const readSeen = (): string[] => {
  try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]; } catch { return []; }
};
export const writeSeen = (keys: string[]) => {
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...new Set(keys)].slice(-500))); } catch { /* 저장소 없음 */ }
};

type DonationRow = { id: number; request_no: string; name: string; year: number; member_name: string | null; is_returning: boolean; created_at: string };
type ExpenseRow = { id: number; requester_name: string | null; department: string | null; content: string; amount: number; requested_at: string };
type BudgetRow = { id: number; year: number; amount: number; requester_name: string | null; requested_at: string; department: { name: string } | null };

export function toItems(d: DonationRow[], e: ExpenseRow[], b: BudgetRow[]): PendingItem[] {
  const won = (n: number) => Number(n).toLocaleString("ko-KR") + "원";
  const items: PendingItem[] = [
    ...d.map((r) => ({
      kind: "donation" as const, id: r.id, title: `${r.name} · ${r.year}년 헌금분`,
      sub: `${r.request_no}${r.member_name ? ` · 교인 ${r.member_name}` : " · 교인 미연결"}${r.is_returning ? " · 재신청" : ""}`,
      at: r.created_at, href: `/receipt/issue?request=${r.id}&year=${r.year}`,
    })),
    ...e.map((r) => ({
      kind: "expense" as const, id: r.id, title: `${r.requester_name ?? "신청자"} · ${won(r.amount)}`,
      sub: `${r.department ?? "부서 미지정"} · ${r.content}`, at: r.requested_at, href: `/requests/expense?open=${r.id}`,
    })),
    ...b.map((r) => ({
      kind: "budget" as const, id: r.id, title: `${r.department?.name ?? "부서"} · ${won(r.amount)}`,
      sub: `${r.year}년 예산 · ${r.requester_name ?? ""}`.trim(), at: r.requested_at, href: `/requests/budget?open=${r.id}&year=${r.year}`,
    })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at)); // 오래된 신청부터
}

/** 미처리 신청 전부(재정 권한만 읽힌다. 다른 권한은 RLS로 빈 목록) */
export async function loadPending(sb: SupabaseClient): Promise<PendingItem[]> {
  const [d, e, b] = await Promise.all([
    sb.from("v_donation_request").select("id, request_no, name, year, member_name, is_returning, created_at").eq("status", "requested").order("created_at").limit(100),
    sb.from("v_expense_request").select("id, requester_name, department, content, amount, requested_at").eq("status", "requested").order("requested_at").limit(100),
    sb.from("budget_request").select("id, year, amount, requester_name, requested_at, department(name)").eq("status", "requested").order("requested_at").limit(100),
  ]);
  return toItems(must(d) as DonationRow[], must(e) as ExpenseRow[], must(b) as unknown as BudgetRow[]);
}
