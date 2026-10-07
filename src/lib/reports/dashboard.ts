// 대시보드 계산: 금주 리포트, 주간·월·분기 추이, 작년 대비, 송금 계좌 알림, 수지 인사이트(규칙 기반)
// 수입·지출은 일반·특별 기금만(교회 운영). 별도 기금(해외선교·네팔)은 금주 리포트에 따로 적는다.
import { addDays, addMonths, change, lastYearSameDay, monthOf, operating, quarterOf, sum, sundayOf, yearOf, type ExpWeek, type IncWeek } from "./common";

const won = (n: number) => n.toLocaleString("ko-KR");

/** 리포트 기준 주일: 오늘까지 입력이 있는 가장 최근 주일, 없으면 이번 주 주일 */
export function reportSunday(inc: IncWeek[], exp: ExpWeek[], today: string) {
  const days = [...inc, ...exp].map((r) => r.sunday).filter((d) => d <= today);
  return days.length ? days.reduce((a, b) => (a > b ? a : b)) : sundayOf(today);
}

const weekSum = <T extends { sunday: string; amount: number; fund: IncWeek["fund"] }>(xs: T[], sunday: string, op = true) =>
  sum(xs.filter((r) => r.sunday === sunday && operating(r) === op), (r) => r.amount);

/** 금주 수입·지출·잔액과 전주 비교. 잔액 = 올해 이월금 + 올해 수입 누계 − 지출 누계 (주일 기준) */
export function weekReport(inc: IncWeek[], exp: ExpWeek[], sunday: string, carry: number) {
  const prev = addDays(sunday, -7), y = yearOf(sunday);
  const upTo = <T extends { sunday: string; amount: number; fund: IncWeek["fund"] }>(xs: T[]) =>
    sum(xs.filter((r) => operating(r) && yearOf(r.sunday) === y && r.sunday <= sunday), (r) => r.amount);
  return {
    sunday, prevSunday: prev,
    income: weekSum(inc, sunday), expense: weekSum(exp, sunday),
    prevIncome: weekSum(inc, prev), prevExpense: weekSum(exp, prev),
    balance: carry + upTo(inc) - upTo(exp),
    missionIncome: weekSum(inc, sunday, false), missionExpense: weekSum(exp, sunday, false),
  };
}
export type WeekReport = ReturnType<typeof weekReport>;

/** 금주 리포트 문장 */
export function weekReportText(w: WeekReport): string[] {
  const diff = (cur: number, prev: number) => (prev || cur ? ` (전주 대비 ${cur - prev >= 0 ? "+" : "−"}${won(Math.abs(cur - prev))}원, ${change(cur, prev)})` : "");
  const lines = [
    `수입 ${won(w.income)}원${diff(w.income, w.prevIncome)}`,
    `지출 ${won(w.expense)}원${diff(w.expense, w.prevExpense)}`,
    `수지 ${w.income - w.expense >= 0 ? "+" : "−"}${won(Math.abs(w.income - w.expense))}원 · 잔액(이월 포함) ${won(w.balance)}원`,
  ];
  if (w.missionIncome || w.missionExpense) lines.push(`해외선교(별도) 수입 ${won(w.missionIncome)}원 · 지출 ${won(w.missionExpense)}원`);
  return lines;
}

/** 최근 n주 수입·지출 */
export const weeklySeries = (inc: IncWeek[], exp: ExpWeek[], sunday: string, n = 12) =>
  Array.from({ length: n }, (_, i) => addDays(sunday, -7 * (n - 1 - i))).map((d) => ({ sunday: d, income: weekSum(inc, d), expense: weekSum(exp, d) }));

/** 월별 수입·지출 (12개월) */
export const monthlyOf = (inc: IncWeek[], exp: ExpWeek[], year: number) =>
  Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: sum(inc.filter((r) => operating(r) && yearOf(r.sunday) === year && monthOf(r.sunday) === i + 1), (r) => r.amount),
    expense: sum(exp.filter((r) => operating(r) && yearOf(r.sunday) === year && monthOf(r.sunday) === i + 1), (r) => r.amount),
  }));

/** 분기별 수입·지출 */
export const quarterlyOf = (inc: IncWeek[], exp: ExpWeek[], year: number) =>
  [1, 2, 3, 4].map((q) => ({
    quarter: q,
    income: sum(inc.filter((r) => operating(r) && yearOf(r.sunday) === year && quarterOf(r.sunday) === q), (r) => r.amount),
    expense: sum(exp.filter((r) => operating(r) && yearOf(r.sunday) === year && quarterOf(r.sunday) === q), (r) => r.amount),
  }));

/** 올해(1/1~today) vs 작년 같은 기간, 이름별 합계. 큰 순서 */
export function ytdCompare<T extends { sunday: string; amount: number; fund: IncWeek["fund"] }>(xs: T[], name: (r: T) => string, today: string, order?: (r: T) => number) {
  const y = yearOf(today), lastCut = lastYearSameDay(today);
  const m = new Map<string, { name: string; cur: number; prev: number; order: number }>();
  for (const r of xs) {
    if (!operating(r)) continue;
    const ry = yearOf(r.sunday);
    const isCur = ry === y && r.sunday <= today, isPrev = ry === y - 1 && r.sunday <= lastCut;
    if (!isCur && !isPrev) continue;
    const k = name(r), e = m.get(k) ?? { name: k, cur: 0, prev: 0, order: order?.(r) ?? 0 };
    if (isCur) e.cur += r.amount; else e.prev += r.amount;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.cur - a.cur || b.prev - a.prev || a.order - b.order);
}

export type PayeeActivity = { payeeId: number; name: string; bank: string | null; account: string | null; first: string; last: string; cnt: number; total: number };

/** 송금 계좌 알림: 이번 주 처음 이체한 계좌, months개월 넘게 이체가 없는 계좌(최근 것부터) */
export function payeeAlerts(xs: PayeeActivity[], sunday: string, months = 3) {
  const cutoff = addMonths(sunday, -months);
  return {
    firstTime: xs.filter((p) => p.first === sunday),
    dormant: xs.filter((p) => p.last < cutoff).sort((a, b) => b.last.localeCompare(a.last)),
  };
}

/** 연중 경과 비율(0~1) */
export function yearElapsed(today: string) {
  const y = yearOf(today);
  const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  const t = Date.UTC(y, monthOf(today) - 1, Number(today.slice(8, 10)));
  return (t - start + 86400000) / (end - start);
}

/** 수지 인사이트 2~3줄 (정해진 규칙으로 만든 문장, AI 아님) */
export function insights(inc: IncWeek[], exp: ExpWeek[], today: string, budget: { income: number; expense: number }): string[] {
  const out: string[] = [];
  const incCmp = ytdCompare(inc, () => "수입", today)[0] ?? { cur: 0, prev: 0 };
  const expCmp = ytdCompare(exp, () => "지출", today)[0] ?? { cur: 0, prev: 0 };
  if (incCmp.prev) out.push(`올해 수입은 작년 같은 기간보다 ${change(incCmp.cur, incCmp.prev)} ${incCmp.cur >= incCmp.prev ? "늘었어요" : "줄었어요"} (${won(incCmp.cur)}원).`);
  const net = incCmp.cur - expCmp.cur;
  if (incCmp.cur || expCmp.cur) out.push(net >= 0 ? `올해 수입이 지출보다 ${won(net)}원 많아요.` : `올해 지출이 수입보다 ${won(-net)}원 많아요. 지출 흐름을 살펴보세요.`);
  if (budget.expense > 0) {
    const run = expCmp.cur / budget.expense, el = yearElapsed(today);
    const how = run > el + 0.05 ? "계획보다 빨라요" : run < el - 0.05 ? "계획보다 느려요" : "계획과 비슷해요";
    out.push(`지출 예산 집행률 ${(run * 100).toFixed(1)}% (연중 경과 ${(el * 100).toFixed(0)}%) — ${how}.`);
  } else if (budget.income > 0) {
    out.push(`수입 예산 달성률 ${((incCmp.cur / budget.income) * 100).toFixed(1)}% (연중 경과 ${(yearElapsed(today) * 100).toFixed(0)}%).`);
  }
  const up = ytdCompare(exp, (r) => r.dept, today).filter((d) => d.prev > 0 && d.cur > d.prev).sort((a, b) => b.cur - b.prev - (a.cur - a.prev))[0];
  if (up && out.length < 3) out.push(`작년보다 가장 많이 늘어난 지출은 ${up.name} (+${won(up.cur - up.prev)}원, ${change(up.cur, up.prev)}).`);
  return out.slice(0, 3);
}
