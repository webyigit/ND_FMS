// 과거 지출내역: 검색과 월별 합계
export type HistRow = { id: number; sunday: string; month: number; department: string; item: string; content: string; amount: number; requester: string; memo: string };
export type HistFilter = { name?: string; amount?: string; content?: string; memo?: string };

/** 금액 검색: "50000" 같으면, "10000~50000" 범위. 쉼표는 무시 */
export function amountMatch(amount: number, q: string) {
  const s = q.replace(/[,\s원]/g, "");
  if (!s) return true;
  const [a, b] = s.split("~");
  if (b !== undefined) {
    const lo = a ? Number(a) : -Infinity, hi = b ? Number(b) : Infinity;
    return amount >= lo && amount <= hi;
  }
  return amount === Number(a);
}

const has = (v: string, q?: string) => !q?.trim() || v.toLowerCase().includes(q.trim().toLowerCase());

export function filterHistory(rows: HistRow[], f: HistFilter) {
  return rows.filter((r) => has(r.requester, f.name) && has(`${r.content} ${r.item}`, f.content) && has(r.memo, f.memo) && amountMatch(r.amount, f.amount ?? ""));
}

export function monthlyTotals(rows: HistRow[]) {
  const m = new Map<number, { month: number; count: number; total: number }>();
  rows.forEach((r) => {
    const x = m.get(r.month) ?? (m.set(r.month, { month: r.month, count: 0, total: 0 }), m.get(r.month)!);
    x.count++; x.total += r.amount;
  });
  return [...m.values()].sort((a, b) => a.month - b.month);
}
