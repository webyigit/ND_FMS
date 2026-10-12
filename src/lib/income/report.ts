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
/** noName: 이름 없이 합계로만 들어온 금액(과거 이관분 '개인내역 없음/미기재'). entries 에는 넣지 않는다 */
export type WeeklyType = Money & { id: number; name: string; fund: Fund; totalOnly: boolean; count: number; entries: Entry[]; noName: number; prev: number; ytd: number };
/** prev: 올해 1/1~전주 누계, ytd: prev + 금주 합계 */
export type Ytd = { prev: number; ytd: number };
export type WeeklyReport = { types: WeeklyType[]; byFund: Record<Fund, Money & Ytd>; generalSpecial: Money & Ytd; grand: Money & Ytd; count: number; noName: number };
/** 이름(교인 연결·원문 표기) 없는 행 */
export const isNoName = (r: Pick<IncomeViewRow, "member_id" | "payer_label">) => r.member_id == null && !r.payer_label?.trim();
/** v_income_week 한 행 (올해 1/1 ~ 전주, 헌금구분별 합계) */
export type PriorRow = Pick<IncomeViewRow, "offering_type_id" | "offering_type" | "type_order" | "fund_kind" | "amount">;

/** 헌금구분별 소계·현금/이체·기금 합계와 올해 누계(전주까지 + 금주). 별도 기금은 일반·특별 합계에서 뺀다. 이름은 노출순서 규칙대로 */
export function weeklyReport(rows: IncomeViewRow[], types: TypeRef[], rankOf: (memberId: number) => number | null | undefined = () => null, prior: PriorRow[] = []): WeeklyReport {
  const list: TypeRef[] = [...types];
  // 목록에 없는(비활성 등) 헌금구분도 빠뜨리지 않는다 (누계에만 있는 것 포함)
  [...rows, ...prior].sort((a, b) => (a.type_order ?? 999) - (b.type_order ?? 999)).forEach((r) => {
    if (!list.some((t) => t.id === r.offering_type_id)) list.push({ id: r.offering_type_id, name: r.offering_type, fund: fundOf(r.fund_kind) });
  });
  const out = list.map((t): WeeklyType => {
    const mine = rows.filter((r) => r.offering_type_id === t.id);
    const m = zero();
    mine.forEach((r) => add(m, r.channel, Number(r.amount)));
    const named = mine.filter((r) => !isNoName(r));
    const noName = mine.filter(isNoName).reduce((s, r) => s + Number(r.amount), 0);
    const entries = sortForList(named.map((r) => ({
      name: displayName(r), amount: Number(r.amount), memo: r.memo ?? "", channel: r.channel,
      displayRank: r.member_id != null ? rankOf(r.member_id) : null,
    })));
    const prev = prior.filter((r) => r.offering_type_id === t.id).reduce((s, r) => s + Number(r.amount), 0);
    return { ...m, id: t.id, name: t.name, fund: t.fund, totalOnly: !!t.totalOnly, count: mine.length, entries, noName, prev, ytd: prev + m.total };
  });
  const sumUp = (ts: (Money & Ytd)[]) => ts.reduce((s, t) => ({ ...plus(s, t), prev: s.prev + t.prev, ytd: s.ytd + t.ytd }), { ...zero(), prev: 0, ytd: 0 });
  const byFund = Object.fromEntries(FUNDS.map((f) => [f, sumUp(out.filter((t) => t.fund === f))])) as Record<Fund, Money & Ytd>;
  const generalSpecial = sumUp([byFund.일반, byFund.특별]);
  return { types: out, byFund, generalSpecial, grand: sumUp([generalSpecial, byFund.별도]), count: rows.length, noName: out.reduce((s, t) => s + t.noName, 0) };
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

export const NO_NAME = "개인내역 없음(합계만)";
/** 명단에 올릴 헌금구분: 이번 주 금액이 있는 것 전부(총액만 받는 구분은 합계 한 줄) */
export const listedTypes = (rep: WeeklyReport) => rep.types.filter((t) => t.total !== 0);

export const entryLabel = (e: Entry) => (e.memo ? `${e.name}(${e.memo})` : e.name);

// ===== 예산 대비 진도율 (원본 'MM-DD_주일헌금현황' 상단 표) =====
/** 원본 시트의 회계 › 구분 › 항목 묶음. 헌금구분 이름으로 맞춘다(감사헌금 = 범사+기타+일천번제) */
const LAYOUT: [Fund, string, string, string[]][] = [
  ["일반", "일반회계", "십일조", ["십일조"]],
  ["일반", "일반회계", "주일헌금", ["주일헌금"]],
  ["일반", "일반회계", "감사헌금", ["범사감사", "기타감사", "일천번제"]],
  ["일반", "기타", "신년", ["신년감사"]],
  ["일반", "기타", "기관", ["기관헌금"]],
  ["일반", "절기헌금", "부활절", ["부활절"]],
  ["일반", "절기헌금", "맥추절", ["맥추감사절"]],
  ["일반", "절기헌금", "추수", ["추수감사절"]],
  ["일반", "절기헌금", "성탄절", ["성탄절"]],
  ["특별", "특별헌금", "이웃사랑헌금", ["이웃사랑"]],
  ["특별", "특별헌금", "꽃꽂이", ["꽃꽂이"]],
  ["특별", "특별헌금", "건축(E/V)헌금", ["건축"]],
  ["별도", "선교헌금", "해외선교", ["해외선교"]],
  ["별도", "선교헌금", "네팔선교", ["네팔선교"]],
];
export const SECTION_LABEL: Record<Fund, string> = { 일반: "일반 회계", 특별: "특별 회계", 별도: "별도 회계" };
/** budget: 올해 예산(A), week: 이번 주, prev: 지난주까지, ytd: 총누계(B), rate: B/A ×100 (예산 없으면 null) */
export type ProgressRow = { group: string; item: string; budget: number; week: number; prev: number; ytd: number; rate: number | null };
export type ProgressSection = { fund: Fund; label: string; total: ProgressRow; rows: ProgressRow[] };

const rateOf = (ytd: number, budget: number) => (budget ? (ytd / budget) * 100 : null);
/** 진도율 표기: 소수 둘째 자리, 없으면 '-' */
export const pct = (r: number | null) => (r == null || r === 0 ? "-" : r.toFixed(2));

/** 회계별 합계 + 구분·항목 행. 원본에 없는 헌금구분은 금액·예산이 있을 때만 '기타'로 덧붙인다. 별도 회계는 금액이 있을 때만 */
export function progressReport(rep: WeeklyReport, budgetOf: (typeId: number) => number): ProgressSection[] {
  const used = new Set<number>();
  const row = (group: string, item: string, ts: WeeklyType[]): ProgressRow => {
    ts.forEach((t) => used.add(t.id));
    const budget = ts.reduce((s, t) => s + budgetOf(t.id), 0);
    const ytd = ts.reduce((s, t) => s + t.ytd, 0);
    return { group, item, budget, week: ts.reduce((s, t) => s + t.total, 0), prev: ts.reduce((s, t) => s + t.prev, 0), ytd, rate: rateOf(ytd, budget) };
  };
  const rowsOf = (f: Fund) => LAYOUT.filter((l) => l[0] === f).map(([, g, item, names]) => row(g, item, rep.types.filter((t) => t.fund === f && names.includes(t.name))));
  const layoutRows = Object.fromEntries(FUNDS.map((f) => [f, rowsOf(f)])) as Record<Fund, ProgressRow[]>;
  return FUNDS.map((f) => {
    const extra = rep.types.filter((t) => t.fund === f && !used.has(t.id) && (t.ytd || budgetOf(t.id))).map((t) => row("기타", t.name, [t]));
    const rows = [...layoutRows[f], ...extra];
    const sum = (k: "budget" | "week" | "prev" | "ytd") => rows.reduce((s, r) => s + r[k], 0);
    const total: ProgressRow = { group: "합", item: "계", budget: sum("budget"), week: sum("week"), prev: sum("prev"), ytd: sum("ytd"), rate: rateOf(sum("ytd"), sum("budget")) };
    return { fund: f, label: SECTION_LABEL[f], total, rows };
  }).filter((s) => s.fund !== "별도" || s.total.ytd !== 0);
}

/** 올해 몇 번째 주일인지 / 올해 주일 수 (진도율 비교용 경과율) */
export function sundayIndex(sunday: string) {
  const y = Number(sunday.slice(0, 4));
  const day = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  const first = new Date(Date.UTC(y, 0, 1));
  const firstSunday = Date.UTC(y, 0, 1 + ((7 - first.getUTCDay()) % 7));
  const count = (t: number) => Math.floor((t - firstSunday) / 604800000) + 1;
  return { index: count(day(sunday)), total: count(Date.UTC(y, 11, 31)) };
}

/** 주별 누계(일반 회계): prior(올해 1/1~전주, 주·헌금구분별) + 이번 주 */
export function cumulativeWeeks(prior: (PriorRow & { sunday?: string })[], sunday: string, week: number, fund: Fund = "일반") {
  const by = new Map<string, number>();
  prior.filter((r) => r.sunday && fundOf(r.fund_kind) === fund).forEach((r) => by.set(r.sunday!, (by.get(r.sunday!) ?? 0) + Number(r.amount)));
  by.set(sunday, (by.get(sunday) ?? 0) + week);
  let acc = 0;
  return [...by.keys()].sort().map((d) => ({ sunday: d, amount: by.get(d)!, cum: (acc += by.get(d)!) }));
}

/** 엑셀 '현황' 시트: 원본 상단 표 그대로 */
export function progressSheet(rep: WeeklyReport, secs: ProgressSection[], sunday: string, churchLine: string): Sheet {
  const y = sunday.slice(0, 4);
  const g = secs.find((s) => s.fund === "일반")?.total;
  const rows: Sheet["rows"] = [["주일 헌금 현황"], [churchLine, null, null, null, null, sunday], []];
  rows.push(["구분", `${y}년 예산액(A)`, "이번주 헌금액", "지난주 누계액", `${y}년 총누계액(B)`, `${y}년 진도율(%)(B/A)`]);
  if (g) rows.push(["일반회계", g.budget, g.week, g.prev, g.ytd, pct(g.rate)]);
  rows.push([], ["이번주헌금(일반+특별)", rep.generalSpecial.total, `현금 ${rep.generalSpecial.cash.toLocaleString("ko-KR")} · 이체 ${rep.generalSpecial.online.toLocaleString("ko-KR")}`], []);
  rows.push(["회계", "구분", "항목", `${y}예산(A)`, "이번 주", "지난주까지", "총누계(B)", "진도율(%)(B/A)"]);
  secs.forEach((s) => {
    const line = (a: string, r: ProgressRow) => rows.push([a, r.group, r.item, r.budget || null, r.week, r.prev, r.ytd, pct(r.rate)]);
    line(s.fund === "별도" ? `${s.label}(합계 제외)` : s.label, s.total);
    s.rows.forEach((r) => line(s.label, r));
  });
  return { name: "현황", rows, widths: [16, 14, 16, 15, 15, 15, 15, 12] };
}

export function weeklySheets(rep: WeeklyReport, sunday: string): Sheet[] {
  const summary: Sheet["rows"] = [[`${sunday} 주일 헌금 현황`], [], ["기금", "헌금구분", "현금", "이체", "금주 합계", "건수", "전주까지 누계", "올해 누계"]];
  FUNDS.forEach((f) => {
    rep.types.filter((t) => t.fund === f).forEach((t) => summary.push([f, t.name, t.cash, t.online, t.total, t.count, t.prev, t.ytd]));
    const b = rep.byFund[f];
    summary.push([`${f} 소계`, "", b.cash, b.online, b.total, null, b.prev, b.ytd]);
  });
  const g = rep.generalSpecial, a = rep.grand;
  summary.push(["일반·특별 합계", "", g.cash, g.online, g.total, null, g.prev, g.ytd]);
  summary.push(["총계(별도 포함)", "", a.cash, a.online, a.total, rep.count, a.prev, a.ytd]);

  const grid: Sheet["rows"] = [[`${sunday} 헌금 명단`]];
  listedTypes(rep).forEach((t) => {
    grid.push([], [`${t.name} (${t.count}건, ${t.total.toLocaleString("ko-KR")}원)`]);
    if (t.totalOnly) return;
    if (t.entries.length) {
      grid.push(["성명", "금액", "성명", "금액", "성명", "금액", "성명", "금액"]);
      toGrid(t.entries).forEach((row) => grid.push(row.flatMap((e) => (e ? [entryLabel(e), e.amount] : ["", null]))));
    }
    if (t.noName) grid.push([NO_NAME, t.noName]);
  });
  return [
    { name: "기금별", rows: summary, widths: [16, 14, 14, 14, 14, 8], header: 3 },
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
