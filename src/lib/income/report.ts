// 수입 조회·장표 계산 (금주 수입내역, 개인별 헌금현황, 과거 수입내역)
import type { Sheet } from "../excel";
import { sortForList } from "../offeringOrder";

export type Fund = "일반" | "특별" | "별도";
export const FUNDS: Fund[] = ["일반", "특별", "별도"];
export const FUND_OF: Record<string, Fund> = { general: "일반", special: "특별", separate: "별도" };
const fundOf = (kind: string | null | undefined): Fund => FUND_OF[kind ?? ""] ?? "일반";

export type Money = { cash: number; online: number; total: number };
const zero = (): Money => ({ cash: 0, online: 0, total: 0 });
const add = (m: Money, channel: string, amount: number) => {
  if (channel === "online") m.online += amount; else m.cash += amount;
  m.total += amount;
};
const plus = (a: Money, b: Money): Money => ({ cash: a.cash + b.cash, online: a.online + b.online, total: a.total + b.total });

// ===== 금주 수입내역 =====
/** v_income 한 행 */
export type IncomeViewRow = {
  id: number; sunday: string; offering_type_id: number; offering_type: string; type_order: number | null; fund_kind: string | null;
  member_id: number | null; member_name: string | null; payer_label: string | null; channel: "cash" | "online"; amount: number; memo: string | null; bank_tx_id: number | null;
};
export type TypeRef = { id: number; name: string; fund: Fund; totalOnly?: boolean };

/** 장표 표기 이름: 원문 표기(가족 묶음 등) 우선 */
export const displayName = (r: Pick<IncomeViewRow, "payer_label" | "member_name">) => r.payer_label?.trim() || r.member_name || "무명";

export type Entry = { name: string; amount: number; memo: string; channel: "cash" | "online"; displayRank?: number | null };
export type WeeklyType = Money & { id: number; name: string; fund: Fund; totalOnly: boolean; count: number; entries: Entry[] };
export type WeeklyReport = { types: WeeklyType[]; byFund: Record<Fund, Money>; generalSpecial: Money; grand: Money; count: number };

/** 헌금구분별 소계·현금/이체·기금 합계. 별도 기금은 일반·특별 합계에서 뺀다. 이름은 노출순서 규칙대로 */
export function weeklyReport(rows: IncomeViewRow[], types: TypeRef[], rankOf: (memberId: number) => number | null | undefined = () => null): WeeklyReport {
  const list: TypeRef[] = [...types];
  // 목록에 없는(비활성 등) 헌금구분도 빠뜨리지 않는다
  [...rows].sort((a, b) => (a.type_order ?? 999) - (b.type_order ?? 999)).forEach((r) => {
    if (!list.some((t) => t.id === r.offering_type_id)) list.push({ id: r.offering_type_id, name: r.offering_type, fund: fundOf(r.fund_kind) });
  });
  const out = list.map((t): WeeklyType => {
    const mine = rows.filter((r) => r.offering_type_id === t.id);
    const m = zero();
    mine.forEach((r) => add(m, r.channel, Number(r.amount)));
    const entries = sortForList(mine.map((r) => ({
      name: displayName(r), amount: Number(r.amount), memo: r.memo ?? "", channel: r.channel,
      displayRank: r.member_id != null ? rankOf(r.member_id) : null,
    })));
    return { ...m, id: t.id, name: t.name, fund: t.fund, totalOnly: !!t.totalOnly, count: mine.length, entries };
  });
  const byFund = Object.fromEntries(FUNDS.map((f) => [f, out.filter((t) => t.fund === f).reduce((s, t) => plus(s, t), zero())])) as Record<Fund, Money>;
  const generalSpecial = plus(byFund.일반, byFund.특별);
  return { types: out, byFund, generalSpecial, grand: plus(generalSpecial, byFund.별도), count: rows.length };
}

/** (성명, 금액) × cols 그리드로 나눈다. 마지막 줄은 null로 채움 */
export function toGrid<T>(xs: T[], cols = 4): (T | null)[][] {
  const out: (T | null)[][] = [];
  for (let i = 0; i < xs.length; i += cols) {
    const row: (T | null)[] = xs.slice(i, i + cols);
    while (row.length < cols) row.push(null);
    out.push(row);
  }
  return out;
}

export const entryLabel = (e: Entry) => (e.memo ? `${e.name}(${e.memo})` : e.name);

export function weeklySheets(rep: WeeklyReport, sunday: string): Sheet[] {
  const summary: Sheet["rows"] = [[`${sunday} 주일 헌금 현황`], [], ["기금", "헌금구분", "현금", "이체", "합계", "건수"]];
  FUNDS.forEach((f) => {
    rep.types.filter((t) => t.fund === f).forEach((t) => summary.push([f, t.name, t.cash, t.online, t.total, t.count]));
    summary.push([`${f} 소계`, "", rep.byFund[f].cash, rep.byFund[f].online, rep.byFund[f].total, null]);
  });
  summary.push(["일반·특별 합계", "", rep.generalSpecial.cash, rep.generalSpecial.online, rep.generalSpecial.total, null]);
  summary.push(["총계(별도 포함)", "", rep.grand.cash, rep.grand.online, rep.grand.total, rep.count]);

  const grid: Sheet["rows"] = [[`${sunday} 헌금 명단`]];
  rep.types.filter((t) => !t.totalOnly && t.entries.length).forEach((t) => {
    grid.push([], [`${t.name} (${t.count}건, ${t.total.toLocaleString("ko-KR")}원)`], ["성명", "금액", "성명", "금액", "성명", "금액", "성명", "금액"]);
    toGrid(t.entries).forEach((row) => grid.push(row.flatMap((e) => (e ? [entryLabel(e), e.amount] : ["", null]))));
  });
  return [
    { name: "요약", rows: summary, widths: [16, 14, 14, 14, 14, 8], header: 3 },
    { name: "명단", rows: grid, widths: [14, 12, 14, 12, 14, 12, 14, 12], header: 1 },
  ];
}

// ===== 개인별 헌금현황 =====
/** v_income_person 한 행 */
export type PersonAggRow = {
  year: number; month: number; member_id: number | null; member_name: string | null; household_id: number | null; household_label: string | null;
  payer_label: string | null; offering_type_id: number; offering_type: string; type_order: number | null; fund_kind: string | null; amount: number; n: number;
};
export type PersonTotal = {
  key: string; name: string; memberId: number | null; householdId: number | null; householdLabel: string | null;
  byType: Record<number, number>; byMonth: number[]; total: number; n: number; members: string[];
};

export const personKey = (r: Pick<PersonAggRow, "member_id" | "payer_label">) => (r.member_id != null ? `m${r.member_id}` : `l${r.payer_label ?? ""}`);
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "ko");

function emptyTotal(key: string, name: string, r?: PersonAggRow): PersonTotal {
  return {
    key, name, memberId: r?.member_id ?? null, householdId: r?.household_id ?? null, householdLabel: r?.household_label ?? null,
    byType: {}, byMonth: Array(12).fill(0), total: 0, n: 0, members: [name],
  };
}
function accumulate(p: PersonTotal, typeId: number, month: number, amount: number, n: number) {
  p.byType[typeId] = (p.byType[typeId] ?? 0) + amount;
  if (month >= 1 && month <= 12) p.byMonth[month - 1] += amount;
  p.total += amount;
  p.n += n;
}

/** 개인별 합계(교인은 id로, 미등록 표기는 원문으로 묶음). 가나다순 */
export function personTotals(rows: PersonAggRow[]): PersonTotal[] {
  const map = new Map<string, PersonTotal>();
  rows.forEach((r) => {
    const k = personKey(r);
    const p = map.get(k) ?? emptyTotal(k, r.member_name ?? r.payer_label ?? "무명", r);
    map.set(k, p);
    accumulate(p, r.offering_type_id, r.month, Number(r.amount), r.n);
  });
  return [...map.values()].sort(byName);
}

/** 가족 단위 합산: 같은 household 는 한 줄. 가족 없는 사람은 그대로 */
export function householdTotals(ps: PersonTotal[]): PersonTotal[] {
  const map = new Map<string, PersonTotal>();
  ps.forEach((p) => {
    if (p.householdId == null) { map.set(p.key, { ...p, byType: { ...p.byType }, byMonth: [...p.byMonth], members: [p.name] }); return; }
    const k = `h${p.householdId}`;
    let h = map.get(k);
    if (!h) {
      h = { ...emptyTotal(k, ""), householdId: p.householdId, householdLabel: p.householdLabel, members: [] };
      map.set(k, h);
    }
    h.members.push(p.name);
    Object.entries(p.byType).forEach(([t, v]) => (h.byType[Number(t)] = (h.byType[Number(t)] ?? 0) + v));
    p.byMonth.forEach((v, i) => (h.byMonth[i] += v));
    h.total += p.total;
    h.n += p.n;
  });
  return [...map.values()].map((h) => (h.key.startsWith("h") ? { ...h, name: h.householdLabel || h.members.join(",") } : h)).sort(byName);
}

/** 이름 검색(가족 구성원 이름 포함) */
export const filterByName = (ps: PersonTotal[], q: string) => {
  const s = q.replace(/\s+/g, "");
  return s ? ps.filter((p) => p.name.includes(s) || p.members.some((m) => m.includes(s))) : ps;
};

/** 체크한 사람들 합계 */
export function sumSelected(ps: PersonTotal[], keys: Set<string>) {
  const picked = ps.filter((p) => keys.has(p.key));
  const byType: Record<number, number> = {};
  picked.forEach((p) => Object.entries(p.byType).forEach(([t, v]) => (byType[Number(t)] = (byType[Number(t)] ?? 0) + v)));
  return { count: picked.length, total: picked.reduce((s, p) => s + p.total, 0), byType, names: picked.map((p) => p.name) };
}

/** 헌금구분 × 월 표 (개인 상세, 과거 수입 리포트 공용) */
export type TypeMonth = { id: number; name: string; fund: Fund; order: number; months: number[]; total: number };
export type Matrix = { types: TypeMonth[]; monthTotals: number[]; byFund: Record<Fund, number[]>; total: number };

export function typeMonthMatrix(rows: { month: number; offering_type_id: number; offering_type: string; type_order: number | null; fund_kind: string | null; amount: number }[]): Matrix {
  const map = new Map<number, TypeMonth>();
  const monthTotals = Array(12).fill(0) as number[];
  const byFund = Object.fromEntries(FUNDS.map((f) => [f, Array(12).fill(0)])) as Record<Fund, number[]>;
  rows.forEach((r) => {
    const t = map.get(r.offering_type_id) ?? { id: r.offering_type_id, name: r.offering_type, fund: fundOf(r.fund_kind), order: r.type_order ?? 999, months: Array(12).fill(0), total: 0 };
    map.set(t.id, t);
    const a = Number(r.amount), i = r.month - 1;
    if (i < 0 || i > 11) return;
    t.months[i] += a; t.total += a; monthTotals[i] += a; byFund[t.fund][i] += a;
  });
  const types = [...map.values()].sort((a, b) => a.order - b.order || a.id - b.id);
  return { types, monthTotals, byFund, total: monthTotals.reduce((s, v) => s + v, 0) };
}

export const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

export function matrixSheet(name: string, title: string, m: Matrix): Sheet {
  const rows: Sheet["rows"] = [[title], ["기금", "헌금구분", ...MONTHS, "합계"]];
  m.types.forEach((t) => rows.push([t.fund, t.name, ...t.months, t.total]));
  FUNDS.forEach((f) => rows.push([`${f} 소계`, "", ...m.byFund[f], m.byFund[f].reduce((s, v) => s + v, 0)]));
  const gs = m.byFund.일반.map((v, i) => v + m.byFund.특별[i]);
  rows.push(["일반·특별 합계", "", ...gs, gs.reduce((s, v) => s + v, 0)]);
  rows.push(["총계", "", ...m.monthTotals, m.total]);
  return { name, rows, widths: [14, 14, ...Array(12).fill(11), 13], header: 2 };
}

export function personSheet(year: number, ps: PersonTotal[], types: { id: number; name: string }[], family: boolean): Sheet {
  const rows: Sheet["rows"] = [[`${year}년 개인별 헌금현황${family ? " (가족 합산)" : ""}`], [family ? "가족/이름" : "이름", ...(family ? ["구성원"] : []), ...types.map((t) => t.name), "합계"]];
  ps.forEach((p) => rows.push([p.name, ...(family ? [p.members.join(",")] : []), ...types.map((t) => p.byType[t.id] ?? null), p.total]));
  rows.push(["합계", ...(family ? [""] : []), ...types.map((t) => ps.reduce((s, p) => s + (p.byType[t.id] ?? 0), 0)), ps.reduce((s, p) => s + p.total, 0)]);
  return { name: "개인별", rows, widths: [16, ...(family ? [24] : []), ...types.map(() => 12), 14], header: 2 };
}
