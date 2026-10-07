// 헌금구분: 상위 > 하위 순서로 펼치기, 순서 바꾸기 (순수 함수)

export type OtRow = {
  id: number; name: string; fund_id: number | null; parent_id: number | null;
  total_only: boolean | null; amount_unit: number | null; has_memo: boolean | null;
  sort_order: number | null; active: boolean | null;
};

const bySort = (a: OtRow, b: OtRow) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || a.id - b.id;

/** 상위 구분 다음에 그 하위 구분이 오도록 펼친다. depth 1 = 하위 */
export function flattenTree(rows: OtRow[]): (OtRow & { depth: number })[] {
  const ids = new Set(rows.map((r) => r.id));
  const tops = rows.filter((r) => r.parent_id == null || !ids.has(r.parent_id)).sort(bySort);
  return tops.flatMap((t) => [
    { ...t, depth: 0 },
    ...rows.filter((r) => r.parent_id === t.id).sort(bySort).map((c) => ({ ...c, depth: 1 })),
  ]);
}

/** 같은 단계(같은 상위) 안에서 위/아래로 옮긴 뒤 전체 순서(id 목록)를 돌려준다. 못 옮기면 null */
export function moveType(rows: OtRow[], id: number, dir: -1 | 1): number[] | null {
  const me = rows.find((r) => r.id === id);
  if (!me) return null;
  const siblings = rows.filter((r) => (r.parent_id ?? null) === (me.parent_id ?? null)).sort(bySort);
  const i = siblings.findIndex((r) => r.id === id);
  const j = i + dir;
  if (j < 0 || j >= siblings.length) return null;
  const swapped = siblings.map((r, k) => (k === i ? siblings[j] : k === j ? siblings[i] : r));
  const order = new Map(swapped.map((r, k) => [r.id, k]));
  // 형제끼리 자리만 바꾸고 나머지는 그대로 둔 채 다시 펼친다
  const resorted = rows.map((r) => (order.has(r.id) ? { ...r, sort_order: (siblings[order.get(r.id)!].sort_order ?? 1e9) + order.get(r.id)! * 1e-6 } : r));
  return flattenTree(resorted).map((r) => r.id);
}

export const UNITS = [
  { value: 1, label: "원 단위" },
  { value: 1000, label: "천원 단위" },
  { value: 10000, label: "만원 단위" },
];
export const FUND_LABEL: Record<string, string> = { general: "일반", special: "특별", separate: "별도" };
