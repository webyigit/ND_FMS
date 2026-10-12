// 헌금명단 노출 순서(요구사항 2.1): 지정 직분(원로목사, 담임목사, 은퇴장로, 원로장로, 시무장로...) 먼저,
// 같은 직분 안에서는 교인별 순서(임직순 등), 나머지 일반 성도는 가나다순. 관리자가 '명단순서'에서 바꾼다.
export type Listed = { name: string; displayRank?: number | null };

/** 요구사항 기본 직분 순서 (app_setting 'list_title_order'가 없을 때) */
export const DEFAULT_TITLE_ORDER = ["원로목사", "담임목사", "은퇴장로", "원로장로", "시무장로"];

export function sortForList<T extends Listed>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ra = a.displayRank ?? Infinity;
    const rb = b.displayRank ?? Infinity;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, "ko");
  });
}

const STEP = 100000;
/** 직분 순서·교인 순서를 합친 정렬 순위. 지정 직분도 교인 순서도 없으면 null(가나다) */
export function listRank(m: { title?: string | null; rank?: number | null }, titleOrder: string[]): number | null {
  const t = m.title ? titleOrder.indexOf(m.title) : -1;
  const own = m.rank ?? STEP - 1;
  if (t >= 0) return t * STEP + own;
  return m.rank != null ? titleOrder.length * STEP + m.rank : null;
}

/** 직분 순서 정리: 앞뒤 공백·빈 값·중복 제거 */
export const cleanTitles = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
