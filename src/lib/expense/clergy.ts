// 교역자급여내역: 사람(직분 순) × 월 합계
export type ClergyRow = { year: number; month: number; name: string; title: string; item: string; amount: number; paidAt: string };
export type ClergyPerson = { name: string; title: string; byMonth: number[] };

export function clergyByPerson(rows: ClergyRow[], titles: readonly string[]): ClergyPerson[] {
  const m = new Map<string, ClergyPerson>();
  rows.forEach((r) => {
    if (!m.has(r.name)) m.set(r.name, { name: r.name, title: r.title, byMonth: Array(13).fill(0) });
    m.get(r.name)!.byMonth[r.month] += r.amount;
  });
  const order = (t: string) => (titles.indexOf(t) + 1 || 99);
  return [...m.values()].sort((a, b) => order(a.title) - order(b.title) || a.name.localeCompare(b.name, "ko"));
}
