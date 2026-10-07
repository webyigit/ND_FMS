// 금주 수입/지출 리포트 계산 (원본 '주간' 시트 레이아웃)
// 잔액 = 이월금(carryover, 해당 연도) + 그 해 누계. 기금별 숫자는 DB 함수 fund_balances 가 준다.
export type FundKind = "general" | "special" | "separate";
export const FUND_LABEL: Record<FundKind, string> = { general: "일반회계", special: "특별회계", separate: "별도기금" };

export type FundBalance = { kind: FundKind; name: string; carry: number; prevNet: number; weekIn: number; weekOut: number; weekTransfer: number; balance: number };
type Num = number | string | null;
export type FundBalanceRow = { kind: string; name: string; carry: Num; prev_net: Num; week_in: Num; week_out: Num; week_transfer: Num; balance: Num };
export const fromFundRows = (rows: FundBalanceRow[]): FundBalance[] =>
  rows.map((r) => ({
    kind: (["general", "special", "separate"].includes(r.kind) ? r.kind : "general") as FundKind,
    name: r.name, carry: Number(r.carry ?? 0), prevNet: Number(r.prev_net ?? 0),
    weekIn: Number(r.week_in ?? 0), weekOut: Number(r.week_out ?? 0), weekTransfer: Number(r.week_transfer ?? 0), balance: Number(r.balance ?? 0),
  }));

/** 수입/지출 표 한 줄: 지난주 잔액 A, 이번 주 수입 B, 지출 C, 대체, 잔액 */
export type SummaryLine = { label: string; prev: number; income: number; expense: number; transfer: number; balance: number };

const line = (label: string, xs: FundBalance[]): SummaryLine => ({
  label,
  prev: xs.reduce((s, f) => s + f.carry + f.prevNet, 0),
  income: xs.reduce((s, f) => s + f.weekIn, 0),
  expense: xs.reduce((s, f) => s + f.weekOut, 0),
  transfer: xs.reduce((s, f) => s + f.weekTransfer, 0),
  balance: xs.reduce((s, f) => s + f.balance, 0),
});

/** 일반·특별(별도 기금 제외) 각각과 합계 */
export function weekSummary(funds: FundBalance[]) {
  const kinds: FundKind[] = ["general", "special"];
  const lines = kinds.map((k) => line(FUND_LABEL[k], funds.filter((f) => f.kind === k)));
  return { lines, total: line("합계", funds.filter((f) => f.kind !== "separate")) };
}

/** 별도 기금 지출을 어느 줄(해외선교/네팔선교…)에 넣을지: 이름 앞부분이 들어 있으면 그 줄, 없으면 첫 줄 [확인 필요] */
export const lineOf = (names: string[], text: string) =>
  names.find((n) => text.includes(n.replace(/(선교|구호)$/, ""))) ?? names[0] ?? "별도기금";

export type SepIn = { name: string; amount: number; thisWeek: boolean };
export type SepOut = { text: string; amount: number; thisWeek: boolean };
export type SepLine = { name: string; weekIn: number; weekOut: number; yearIn: number; yearOut: number };

/** 해외선교·네팔 등 별도 기금: 줄별 이번 주/올해 누계 수입·지출 */
export function separateLines(names: string[], income: SepIn[], expense: SepOut[]): SepLine[] {
  const all = [...names];
  const get = (n: string) => {
    if (!all.includes(n)) all.push(n);
    return n;
  };
  const m = new Map<string, SepLine>();
  const row = (n: string) => m.get(n) ?? (m.set(n, { name: n, weekIn: 0, weekOut: 0, yearIn: 0, yearOut: 0 }), m.get(n)!);
  names.forEach(row);
  income.forEach((i) => { const r = row(get(i.name)); r.yearIn += i.amount; if (i.thisWeek) r.weekIn += i.amount; });
  expense.forEach((e) => { const r = row(lineOf(names, e.text)); r.yearOut += e.amount; if (e.thisWeek) r.weekOut += e.amount; });
  return all.map((n) => m.get(n)!).filter(Boolean);
}

/** 특별헌금 내역: 헌금구분별 (이름, 금액) 묶음과 소계 */
export type OfferingTx = { type: string; name: string; amount: number; memo?: string | null };
export function groupOfferings(rows: OfferingTx[]) {
  const m = new Map<string, { type: string; rows: OfferingTx[]; total: number }>();
  rows.forEach((r) => {
    const g = m.get(r.type) ?? (m.set(r.type, { type: r.type, rows: [], total: 0 }), m.get(r.type)!);
    g.rows.push(r); g.total += r.amount;
  });
  return [...m.values()];
}
