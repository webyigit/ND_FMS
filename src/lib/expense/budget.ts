// 부서별 지출내역: 부서 → 항목별 예산·지출·잔액·집행률, 항목별 지출 상세
import { rate, remain } from "../officersReport";

/** noBudget: 예산 없이 헌금으로 쓰는 기금(특별·별도)의 항목. 예산 대비 잔액·집행률을 내지 않는다 */
export type ItemBudget = { itemId: number; dept: string; deptOrder: number; item: string; itemOrder: number; budget: number; noBudget?: boolean; fundId?: number };
export type DeptTx = { itemId: number; sunday: string; content: string; amount: number; requester: string; memo: string };
export type ItemLine = ItemBudget & { spent: number; remain: number; rate: string; txs: DeptTx[] };
export type DeptLine = { dept: string; budget: number; spent: number; remain: number; rate: string; items: ItemLine[]; noBudget: boolean };

/** from~to(주일 날짜) 사이 지출만 센다. 예산·지출 둘 다 없는 항목은 뺀다.
 *  합계는 예산을 세우는 부서만 더한다. 기금 부서(특별회계·해외선교)는 fundSpent 로 따로 */
export function byDepartment(items: ItemBudget[], txs: DeptTx[], from: string, to: string) {
  const inRange = txs.filter((t) => t.sunday >= from && t.sunday <= to);
  const byItem = new Map<number, DeptTx[]>();
  inRange.forEach((t) => byItem.set(t.itemId, [...(byItem.get(t.itemId) ?? []), t]));
  const lines: ItemLine[] = [...items]
    .sort((a, b) => a.deptOrder - b.deptOrder || a.dept.localeCompare(b.dept, "ko") || a.itemOrder - b.itemOrder)
    .map((i) => {
      const list = (byItem.get(i.itemId) ?? []).sort((a, b) => a.sunday.localeCompare(b.sunday));
      const spent = list.reduce((s, t) => s + t.amount, 0);
      return i.noBudget
        ? { ...i, spent, remain: 0, rate: "-", txs: list }
        : { ...i, spent, remain: remain(i.budget, spent), rate: rate(spent, i.budget), txs: list };
    })
    .filter((l) => l.budget || l.spent);
  const depts: DeptLine[] = [];
  for (const l of lines) {
    let d = depts.find((x) => x.dept === l.dept);
    if (!d) depts.push((d = { dept: l.dept, budget: 0, spent: 0, remain: 0, rate: "-", items: [], noBudget: true }));
    if (!l.noBudget) d.noBudget = false;
    d.items.push(l); d.budget += l.budget; d.spent += l.spent;
  }
  depts.forEach((d) => { if (!d.noBudget) { d.remain = remain(d.budget, d.spent); d.rate = rate(d.spent, d.budget); } });
  const ops = depts.filter((d) => !d.noBudget);
  const budget = ops.reduce((s, d) => s + d.budget, 0), spent = ops.reduce((s, d) => s + d.spent, 0);
  const fundSpent = depts.filter((d) => d.noBudget).reduce((s, d) => s + d.spent, 0);
  return { depts, total: { budget, spent, remain: remain(budget, spent), rate: rate(spent, budget) }, fundSpent };
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

export type FundBalance = { name: string; carry: number; income: number; expense: number; balance: number };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5 + 1;
const short = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/** 부서별 지출내역 탭 맨 위 인사이트. dept 를 안 주면 전체.
 *  asOf: 자료가 들어온 마지막 주일 — 기간 경과율은 from~min(asOf,to) / from~to */
export function deptInsights(
  r: { depts: DeptLine[]; total: { budget: number; spent: number } },
  opts: { from: string; to: string; asOf: string | null; dept?: string; funds?: Map<string, FundBalance> },
): string[] {
  const { from, to, asOf, dept, funds } = opts;
  const end = asOf && asOf < to ? asOf : to;
  const elapsed = asOf && asOf >= from ? Math.min(100, pct(days(from, end), days(from, to))) : 0;
  const pace = (spent: number, budget: number) => {
    const p = pct(spent, budget);
    const gap = Math.round((p - elapsed) * 10) / 10;
    const how = Math.abs(gap) < 5 ? "비슷해요" : gap > 0 ? `${gap}%p 빨라요` : `${-gap}%p 느려요`;
    return `예산 ${short(budget)} 중 ${short(spent)} 집행(${p}%) — 기간 경과 ${elapsed}%보다 ${how}.`;
  };
  const out: string[] = [];
  const fundLine = (name: string) => {
    const f = funds?.get(name);
    if (f) out.push(`${name} 잔액 ${short(f.balance)} = 이월 ${short(f.carry)} + 올해 수입 ${short(f.income)} − 올해 지출 ${short(f.expense)} (오늘까지 누계).`);
  };

  if (!dept) {
    const ops = r.depts.filter((d) => !d.noBudget);
    if (r.total.budget) out.push(`전체 ${pace(r.total.spent, r.total.budget)}`);
    const over = ops.filter((d) => d.remain < 0);
    if (over.length) out.push(`예산을 넘은 부서: ${over.map((d) => `${d.dept}(${short(-d.remain)} 초과)`).join(", ")}.`);
    const top = [...ops].sort((a, b) => b.spent - a.spent).slice(0, 3).filter((d) => d.spent);
    if (top.length && r.total.spent) out.push(`지출이 큰 부서: ${top.map((d) => `${d.dept} ${pct(d.spent, r.total.spent)}%`).join(", ")}.`);
    const fast = ops.filter((d) => d.budget && d.remain >= 0 && pct(d.spent, d.budget) - elapsed >= 15);
    if (fast.length) out.push(`예산 소진이 빠른 부서: ${fast.map((d) => `${d.dept}(${pct(d.spent, d.budget)}%)`).join(", ")}.`);
    r.depts.filter((d) => d.noBudget).forEach((d) => fundLine(d.dept));
    return out;
  }

  const d = r.depts.find((x) => x.dept === dept);
  if (!d) return ["이 기간에 예산이나 지출이 없어요."];
  if (d.noBudget) {
    out.push(`${dept}는 예산 없이 들어온 헌금으로 지출하는 기금이라 예산 대비 잔액·집행률을 내지 않아요. 이 기간 지출 ${short(d.spent)}.`);
    fundLine(dept);
    const top = [...d.items].sort((a, b) => b.spent - a.spent).filter((i) => i.spent).slice(0, 3);
    if (top.length) out.push(`지출이 큰 항목: ${top.map((i) => `${i.item} ${short(i.spent)}`).join(", ")}.`);
    return out;
  }
  out.push(pace(d.spent, d.budget));
  const over = d.items.filter((i) => !i.noBudget && i.remain < 0);
  if (over.length) out.push(`예산을 넘은 항목: ${over.map((i) => `${i.item}(${short(-i.remain)} 초과)`).join(", ")}.`);
  const top = [...d.items].sort((a, b) => b.spent - a.spent).filter((i) => i.spent).slice(0, 3);
  if (top.length && d.spent) out.push(`지출이 큰 항목: ${top.map((i) => `${i.item} ${pct(i.spent, d.spent)}%`).join(", ")}.`);
  const idle = d.items.filter((i) => i.budget && !i.spent);
  if (idle.length) out.push(`아직 지출이 없는 항목 ${idle.length}개: ${idle.slice(0, 4).map((i) => i.item).join(", ")}${idle.length > 4 ? " 등" : ""}.`);
  const fast = d.items.filter((i) => i.budget && i.remain >= 0 && pct(i.spent, i.budget) - elapsed >= 15);
  if (fast.length) out.push(`소진이 빠른 항목: ${fast.map((i) => `${i.item}(${pct(i.spent, i.budget)}%)`).join(", ")}.`);
  return out;
}
