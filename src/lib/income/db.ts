// Supabase 조회는 한 번에 최대 1000행이라 나눠서 모두 읽는다. make(from, to)는 정렬이 고정된 쿼리여야 한다.
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAll<T>(make: (from: number, to: number) => Page<T>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await make(from, from + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

/** PostgREST or() 필터에 넣을 검색어: 구분자·와일드카드 제거 */
export const safeTerm = (s: string) => s.replace(/[,()*%\\:"'.]/g, "").trim();
