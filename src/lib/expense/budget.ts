// 부서별 지출내역: 부서 → 항목별 예산·지출·잔액·집행률, 항목별 지출 상세
import { rate, remain } from "../officersReport";

export type ItemBudget = { itemId: number; dept: string; deptOrder: number; item: string; itemOrder: number; budget: number };
export type DeptTx = { itemId: number; sunday: string; content: string; amount: number; requester: string; memo: string };
export type ItemLine = ItemBudget & { spent: number; remain: number; rate: string; txs: DeptTx[] };
export type DeptLine = { dept: string; budget: number; spent: number; remain: number; rate: string; items: ItemLine[] };

/** from~to(주일 날짜) 사이 지출만 센다. 예산·지출 둘 다 없는 항목은 뺀다 */
export function byDepartment(items: ItemBudget[], txs: DeptTx[], from: string, to: string) {
  const inRange = txs.filter((t) => t.sunday >= from && t.sunday <= to);
  const byItem = new Map<number, DeptTx[]>();
  inRange.forEach((t) => byItem.set(t.itemId, [...(byItem.get(t.itemId) ?? []), t]));
  const lines: ItemLine[] = [...items]
    .sort((a, b) => a.deptOrder - b.deptOrder || a.dept.localeCompare(b.dept, "ko") || a.itemOrder - b.itemOrder)
    .map((i) => {
      const list = (byItem.get(i.itemId) ?? []).sort((a, b) => a.sunday.localeCompare(b.sunday));
      const spent = list.reduce((s, t) => s + t.amount, 0);
      return { ...i, spent, remain: remain(i.budget, spent), rate: rate(spent, i.budget), txs: list };
    })
    .filter((l) => l.budget || l.spent);
  const depts: DeptLine[] = [];
  for (const l of lines) {
    let d = depts.find((x) => x.dept === l.dept);
    if (!d) depts.push((d = { dept: l.dept, budget: 0, spent: 0, remain: 0, rate: "-", items: [] }));
    d.items.push(l); d.budget += l.budget; d.spent += l.spent;
  }
  depts.forEach((d) => { d.remain = remain(d.budget, d.spent); d.rate = rate(d.spent, d.budget); });
  const budget = depts.reduce((s, d) => s + d.budget, 0), spent = depts.reduce((s, d) => s + d.spent, 0);
  return { depts, total: { budget, spent, remain: remain(budget, spent), rate: rate(spent, budget) } };
}

/** 기간 단축: 연간·상반기·하반기·분기·월 */
export function periodRange(year: number, period: string): [string, string] {
  const end = (m: number) => `${year}-${String(m).padStart(2, "0")}-${new Date(year, m, 0).getDate()}`;
  const start = (m: number) => `${year}-${String(m).padStart(2, "0")}-01`;
  if (period === "H1") return [start(1), end(6)];
  if (period === "H2") return [start(7), end(12)];
  const q = /^Q([1-4])$/.exec(period);
  if (q) { const s = (Number(q[1]) - 1) * 3 + 1; return [start(s), end(s + 2)]; }
  const m = /^M(\d{1,2})$/.exec(period);
  if (m) return [start(Number(m[1])), end(Number(m[1]))];
  return [start(1), end(12)];
}
