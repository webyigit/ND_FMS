// 설정 화면 공통 DB 도우미
import type { SupabaseClient } from "@supabase/supabase-js";

type Builder = { range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };

/** 한 번에 1000행 제한(Supabase 기본)을 넘는 목록을 나눠 모두 읽는다 */
export async function fetchAll<T>(make: () => Builder, page = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await make().range(from, from + page - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) return out;
  }
}

/** 지금 로그인한 사람이 관리자인지 */
export async function amIAdmin(sb: SupabaseClient) {
  const { data, error } = await sb.rpc("is_admin");
  if (error) throw error;
  return Boolean(data);
}

/** 외래키로 쓰이는 행인지(삭제 대신 비활성 처리용) */
export const isInUse = (e: unknown) => !!e && typeof e === "object" && "code" in e && (e as { code: string }).code === "23503";
