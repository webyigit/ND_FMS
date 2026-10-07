// 기부금영수증 계산: 가족 합산, 비율 분할, 영수증 기부내용 줄
export type IncomeRow = {
  offering_type: string; type_order: number | null; month: number;
  member_id: number | null; member_name: string | null; payer_label: string | null; amount: number;
};
export type Named = { name: string; amount: number };
export type Aggregate = {
  total: number;
  types: Named[];                                // 헌금구분별
  months: { month: number; amount: number }[];   // 월별
  sources: { payer_label: string; amount: number }[]; // 헌금 표기별(영수증 1건 ↔ 표기 여러 건)
};
/** DB에 저장하는 detail jsonb */
export type Detail = { types: Record<string, number>; months?: Record<string, number> };

/** 헌금 표기: 원문 표기가 있으면 그것, 없으면 교인 이름 */
export const labelOf = (r: Pick<IncomeRow, "payer_label" | "member_name">) => (r.payer_label?.trim() || r.member_name || "").trim();

export function aggregateIncome(rows: IncomeRow[]): Aggregate {
  const types = new Map<string, { amount: number; order: number }>();
  const months = new Map<number, number>();
  const sources = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const a = Number(r.amount) || 0;
    total += a;
    const t = types.get(r.offering_type) ?? { amount: 0, order: r.type_order ?? 999 };
    t.amount += a;
    types.set(r.offering_type, t);
    months.set(r.month, (months.get(r.month) ?? 0) + a);
    const l = labelOf(r);
    if (l) sources.set(l, (sources.get(l) ?? 0) + a);
  }
  return {
    total,
    types: [...types].sort((a, b) => a[1].order - b[1].order).map(([name, v]) => ({ name, amount: v.amount })),
    months: [...months].sort((a, b) => a[0] - b[0]).map(([month, amount]) => ({ month, amount })),
    sources: [...sources].sort((a, b) => b[1] - a[1]).map(([payer_label, amount]) => ({ payer_label, amount })),
  };
}

/** total을 weights 비율로 원 단위 배분(최대잉여법). 합계가 total과 정확히 같다. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!weights.length) return [];
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map((w) => (total * Math.max(0, w)) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k][1]]++;
  return out;
}

/** 합산 결과를 비율(%)대로 나눈다: 부부 분할 발행 */
export function splitAggregate(agg: Aggregate, ratios: number[]): Aggregate[] {
  const totals = allocate(agg.total, ratios);
  const parts = ratios.map((_, i) => ({ total: totals[i], types: [] as Named[], months: [] as Aggregate["months"], sources: [] as Aggregate["sources"] }));
  agg.types.forEach((t) => allocate(t.amount, ratios).forEach((a, i) => parts[i].types.push({ name: t.name, amount: a })));
  agg.months.forEach((m) => allocate(m.amount, ratios).forEach((a, i) => parts[i].months.push({ month: m.month, amount: a })));
  agg.sources.forEach((s) => allocate(s.amount, ratios).forEach((a, i) => parts[i].sources.push({ payer_label: s.payer_label, amount: a })));
  return parts;
}

export const ratiosOk = (ratios: number[]) => ratios.every((r) => r > 0) && Math.abs(ratios.reduce((s, r) => s + r, 0) - 100) < 0.001;

export function toDetail(agg: Pick<Aggregate, "types" | "months">): Detail {
  return {
    types: Object.fromEntries(agg.types.filter((t) => t.amount).map((t) => [t.name, t.amount])),
    months: Object.fromEntries(agg.months.filter((m) => m.amount).map((m) => [String(m.month).padStart(2, "0"), m.amount])),
  };
}

export function fromDetail(d: Detail | null | undefined): Pick<Aggregate, "types" | "months"> {
  return {
    types: Object.entries(d?.types ?? {}).map(([name, amount]) => ({ name, amount: Number(amount) })),
    months: Object.entries(d?.months ?? {}).map(([m, amount]) => ({ month: Number(m), amount: Number(amount) })).sort((a, b) => a.month - b.month),
  };
}

export type ReceiptLine = { date: string; content: string; amount: number };
/**
 * 영수증 '기부내용' 줄: 월별 헌금을 발행금액에 맞춰 비례 배분(합계 = 발행금액).
 * 월별 자료가 없으면 1년 한 줄. [확인 필요: 월별/연간 한 줄 중 교회 관행]
 */
export function receiptLines(year: number, detail: Detail | null | undefined, issued: number): ReceiptLine[] {
  const months = fromDetail(detail).months.filter((m) => m.amount > 0);
  if (!months.length || !issued) return [{ date: `${year}.01.01~${year}.12.31`, content: "헌금", amount: issued }];
  const amounts = allocate(issued, months.map((m) => m.amount));
  return months
    .map((m, i) => {
      const mm = String(m.month).padStart(2, "0");
      const last = new Date(year, m.month, 0).getDate();
      return { date: `${year}.${mm}.01~${year}.${mm}.${last}`, content: "헌금", amount: amounts[i] };
    })
    .filter((l) => l.amount);
}
