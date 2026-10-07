// 헌금명단 노출 순서: 지정 순위(원로목사, 담임목사, 은퇴장로...) 먼저, 나머지는 가나다순
export type Listed = { name: string; displayRank?: number | null };

export function sortForList<T extends Listed>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ra = a.displayRank ?? Infinity;
    const rb = b.displayRank ?? Infinity;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, "ko");
  });
}
