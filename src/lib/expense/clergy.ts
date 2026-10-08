// 교역자급여내역: 사람(순서·직분 순) × 월 합계
export type ClergyRow = { year: number; month: number; name: string; title: string; item: string; amount: number; paidAt: string; order?: number };
export type ClergyPerson = { name: string; title: string; byMonth: number[]; order?: number };
/** 등록된 교역자(지급 내역이 없어도 표에 0으로 보이게) */
export type ClergyMember = { name: string; title: string; order?: number };

export function clergyByPerson(rows: ClergyRow[], titles: readonly string[], roster: ClergyMember[] = []): ClergyPerson[] {
  const m = new Map<string, ClergyPerson>();
  const add = (name: string, title: string, order?: number) => {
    const p = m.get(name);
    if (!p) m.set(name, { name, title, order, byMonth: Array(13).fill(0) });
    else if (order != null && (p.order == null || order < p.order)) p.order = order;
    return m.get(name)!;
  };
  roster.forEach((c) => add(c.name, c.title, c.order));
  rows.forEach((r) => { add(r.name, r.title, r.order).byMonth[r.month] += r.amount; });
  const rank = (p: ClergyPerson) => p.order ?? 1000 + (titles.indexOf(p.title) + 1 || 99);
  return [...m.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "ko"));
}
