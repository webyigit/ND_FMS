// 해외선교(별도 기금): 주별 수입/지출, 월별 누적, 이월금, 네팔 헌금·구호는 별도 열
import { monthOf, sum, yearOf, type ExpWeek, type IncWeek } from "./common";
import type { MissionTx } from "../officersReport";

/** 네팔 헌금·네팔 구호 구분 (헌금구분·항목 이름에 '네팔') */
export const isNepal = (name: string) => name.includes("네팔");

export type MissionWeek = { sunday: string; month: number; income: number; nepalIncome: number; expense: number; nepalExpense: number; balance: number };

/** 그 해 별도 기금 주별 표. balance = 이월금 + 누계(수입 − 지출), 네팔 포함 */
export function missionWeeks(inc: IncWeek[], exp: ExpWeek[], year: number, carry: number): MissionWeek[] {
  const i = inc.filter((r) => r.fund === "별도" && yearOf(r.sunday) === year);
  const e = exp.filter((r) => r.fund === "별도" && yearOf(r.sunday) === year);
  const days = [...new Set([...i, ...e].map((r) => r.sunday))].sort();
  let bal = carry;
  return days.map((d) => {
    const wi = i.filter((r) => r.sunday === d), we = e.filter((r) => r.sunday === d);
    const row = {
      sunday: d, month: monthOf(d),
      income: sum(wi.filter((r) => !isNepal(r.type)), (r) => r.amount), nepalIncome: sum(wi.filter((r) => isNepal(r.type)), (r) => r.amount),
      expense: sum(we.filter((r) => !isNepal(r.item)), (r) => r.amount), nepalExpense: sum(we.filter((r) => isNepal(r.item)), (r) => r.amount),
    };
    bal += row.income + row.nepalIncome - row.expense - row.nepalExpense;
    return { ...row, balance: bal };
  });
}

export type MissionMonth = Omit<MissionWeek, "sunday"> & { cumIncome: number; cumExpense: number };

/** 월별 합계와 누적(이월금 제외 누계), 월말 잔액 */
export function missionMonths(weeks: MissionWeek[], carry: number): MissionMonth[] {
  let ci = 0, ce = 0, bal = carry;
  return Array.from({ length: 12 }, (_, k) => {
    const ws = weeks.filter((w) => w.month === k + 1);
    const m = { month: k + 1, income: sum(ws, (w) => w.income), nepalIncome: sum(ws, (w) => w.nepalIncome), expense: sum(ws, (w) => w.expense), nepalExpense: sum(ws, (w) => w.nepalExpense) };
    ci += m.income + m.nepalIncome; ce += m.expense + m.nepalExpense; bal = carry + ci - ce;
    return { ...m, cumIncome: ci, cumExpense: ce, balance: bal };
  });
}

/** 보고서(재직회·감사)용 원장 거래: 수입은 주별 헌금 합계, 지출은 건별 */
export function missionTxs(inc: IncWeek[], expDetail: { date: string; content: string; amount: number }[]): MissionTx[] {
  const byWeek = new Map<string, number>();
  inc.filter((r) => r.fund === "별도").forEach((r) => byWeek.set(`${r.sunday}|${r.type}`, (byWeek.get(`${r.sunday}|${r.type}`) ?? 0) + r.amount));
  return [
    ...[...byWeek].map(([k, v]) => { const [date, type] = k.split("|"); return { date, content: `${type} 헌금`, income: v, expense: 0 }; }),
    ...expDetail.map((t) => ({ date: t.date, content: t.content, income: 0, expense: t.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date) || b.income - a.income);
}
