"use client";
import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faLightbulb, faFileLines, faChartLine } from "@fortawesome/free-solid-svg-icons";
import type { SupabaseClient } from "@supabase/supabase-js";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import { card } from "@/components/ui/Buttons";
import EChart, { C, compareHOption, compareOption, flowOption, man, wonTip } from "@/components/charts/EChart";
import { useDbQuery } from "@/lib/db/useDb";
import { localDate, won } from "@/lib/format";
import { change, sum, yearOf, type ExpWeek, type IncWeek } from "@/lib/reports/common";
import { insights, monthlyOf, payeeAlerts, quarterlyOf, reportSunday, weekReport, weekReportText, weeklySeries, ytdCompare, ytdReport, ytdReportText, type PayeeActivity } from "@/lib/reports/dashboard";
import { loadBudgets, loadCarry, loadExpWeeks, loadFunds, loadIncWeeks, loadPayees, operatingCarry } from "@/lib/reports/load";
import { demoBudgetTotals, demoExpWeeks, demoIncWeeks } from "@/lib/reports/demoData";

type Data = { inc: IncWeek[]; exp: ExpWeek[]; payees: PayeeActivity[]; carry: number; budget: { income: number; expense: number }; demo: boolean };

async function load(sb: SupabaseClient, year: number): Promise<Data> {
  const [inc, exp, payees, budgets, funds, carry] = await Promise.all([
    loadIncWeeks(sb, year - 1, year), loadExpWeeks(sb, year - 1, year), loadPayees(sb), loadBudgets(sb, year), loadFunds(sb), loadCarry(sb, year),
  ]);
  return {
    inc, exp, payees, demo: false, carry: operatingCarry(funds, carry),
    // 예산 합계: 일반·특별만 [확인 필요: 별도 기금 예산 포함 여부]
    budget: {
      income: sum(budgets.filter((b) => b.offeringTypeId != null), (b) => b.amount),
      expense: sum(budgets.filter((b) => b.expenseItemId != null), (b) => b.amount),
    },
  };
}

const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
const h3 = "mb-3 flex items-center gap-2 text-sm font-semibold text-heading";

export default function Dashboard() {
  const today = localDate();
  const year = yearOf(today);
  const q = useDbQuery((sb) => load(sb, year), [year]);
  const demo = useMemo<Data | null>(() => (q.loading || q.data || q.error ? null : { inc: demoIncWeeks(), exp: demoExpWeeks(), payees: [], carry: 0, budget: demoBudgetTotals(), demo: true }), [q.loading, q.data, q.error]);
  const data = q.data ?? demo;

  if (q.error) return <><PageHeader /><Notice kind="error">불러오지 못했어요: {q.error}</Notice></>;
  if (!data) return <><PageHeader /><div className="text-sm text-muted">불러오는 중…</div></>;
  return <View d={data} today={today} />;
}

function View({ d, today }: { d: Data; today: string }) {
  const year = yearOf(today);
  const [months, setMonths] = useState(3);
  const sunday = useMemo(() => reportSunday(d.inc, d.exp, today), [d, today]);
  const wr = useMemo(() => weekReport(d.inc, d.exp, sunday, d.carry), [d, sunday]);
  const yr = useMemo(() => ytdReport(d.inc, d.exp, sunday, d.carry), [d, sunday]);
  const alerts = useMemo(() => payeeAlerts(d.payees, sunday, months), [d.payees, sunday, months]);
  const tips = useMemo(() => insights(d.inc, d.exp, today, d.budget), [d, today]);

  const weekly = useMemo(() => {
    const s = weeklySeries(d.inc, d.exp, sunday, 12);
    return flowOption(s.map((w) => w.sunday.slice(5).replace("-", "/")), s.map((w) => w.income), s.map((w) => w.expense));
  }, [d, sunday]);
  const [incMonth, expMonth] = useMemo(() => {
    const cur = monthlyOf(d.inc, d.exp, year), prev = monthlyOf(d.inc, d.exp, year - 1);
    return [compareOption(MONTHS, cur.map((m) => m.income), prev.map((m) => m.income), C.in), compareOption(MONTHS, cur.map((m) => m.expense), prev.map((m) => m.expense), C.out)];
  }, [d, year]);
  const quarter = useMemo(() => {
    const cur = quarterlyOf(d.inc, d.exp, year), prev = quarterlyOf(d.inc, d.exp, year - 1);
    const s = (name: string, data: number[], color: string) => ({ name, type: "bar", data, itemStyle: { color, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 14 });
    return {
      rows: cur.map((c, i) => ({ q: c.quarter, ...c, pi: prev[i].income, pe: prev[i].expense })),
      option: {
        grid: { left: 56, right: 12, top: 32, bottom: 28 }, legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8 },
        tooltip: { trigger: "axis", valueFormatter: wonTip },
        xAxis: { type: "category", data: ["1분기", "2분기", "3분기", "4분기"], axisTick: { show: false }, axisLabel: { color: C.axis } },
        yAxis: { type: "value", axisLabel: { formatter: man, color: C.axis }, splitLine: { lineStyle: { color: C.split } } },
        series: [s(`${year - 1} 수입`, prev.map((p) => p.income), "#a7ddd3"), s(`${year} 수입`, cur.map((c) => c.income), C.in),
          s(`${year - 1} 지출`, prev.map((p) => p.expense), "#f4b5b8"), s(`${year} 지출`, cur.map((c) => c.expense), C.out)],
      },
    };
  }, [d, year]);
  const [dept, types] = useMemo(() => {
    const dp = ytdCompare(d.exp, (r) => r.dept, today, (r) => r.deptOrder ?? 0).slice(0, 12);
    const ty = ytdCompare(d.inc, (r) => r.type, today, (r) => r.typeOrder ?? 0).slice(0, 12);
    return [
      { rows: dp, option: compareHOption(dp.map((x) => x.name), dp.map((x) => x.cur), dp.map((x) => x.prev), C.out) },
      { rows: ty, option: compareHOption(ty.map((x) => x.name), ty.map((x) => x.cur), ty.map((x) => x.prev), C.in) },
    ];
  }, [d, today]);

  const tile = (label: string, v: number, prev: number | null, tone: string, prevLabel = "전주") => (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-xs text-label">{label}</div>
      <div className={`text-lg font-bold ${tone}`}>{won(v)}</div>
      {prev != null && <div className="text-xs text-muted">{prevLabel} {won(prev)} · {change(v, prev)}</div>}
    </div>
  );

  return (
    <>
      <PageHeader actions={<>
        {d.demo && <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">가상 데이터</span>}
        <span className="rounded bg-surface px-2 py-1 text-xs text-label shadow-card">기준 주일 {sunday} · 오늘 {today}</span>
      </>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
        <section className={`${card} p-4`}>
          <h3 className={h3}><FontAwesomeIcon icon={faFileLines} className="text-primary" />금주 리포트 <span className="font-normal text-muted">({sunday} 주일, 일반·특별)</span></h3>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {tile("수입", wr.income, wr.prevIncome, "text-chart-in")}
            {tile("지출", wr.expense, wr.prevExpense, "text-chart-out")}
            {tile("잔액(이월 포함)", wr.balance, null, wr.balance < 0 ? "text-danger" : "text-heading")}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm">{weekReportText(wr).map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-2 text-xs text-muted">잔액 = 올해 이월금(일반·특별) + 올해 수입 누계 − 지출 누계 [확인 필요: 검증시트 장부잔액과 기준 맞추기]</p>
        </section>

        <section className={`${card} p-4`}>
          <h3 className={h3}><FontAwesomeIcon icon={faChartLine} className="text-primary" />누적 리포트 <span className="font-normal text-muted">({yr.from} ~ {sunday}, {yr.weeks}주, 일반·특별)</span></h3>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {tile("수입 누계", yr.income, yr.prevIncome, "text-chart-in", "작년 같은 기간")}
            {tile("지출 누계", yr.expense, yr.prevExpense, "text-chart-out", "작년 같은 기간")}
            {tile("잔액(이월 포함)", yr.balance, null, yr.balance < 0 ? "text-danger" : "text-heading")}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm">{ytdReportText(yr).map((l) => <li key={l}>{l}</li>)}</ul>
        </section>
        </div>

        {/* 오른쪽 열: 왼쪽 열 높이에 맞춰 특이사항 알람·수지 인사이트가 반씩 차지 (lg 이상) */}
        <div className="grid gap-4 lg:grid-rows-2 lg:[contain:size]">
        <section className={`${card} p-4 lg:overflow-y-auto`}>
          <h3 className={h3}><FontAwesomeIcon icon={faBell} className="text-warning" />특이사항 알람</h3>
          {d.demo ? <p className="text-sm text-muted">DB를 연결하면 송금 계좌 이체 이력으로 알려 드려요.</p> : (
            <div className="space-y-3 text-sm">
              <div>
                <div className="mb-1 font-medium text-heading">처음 이체하는 계좌 <span className="text-muted">({alerts.firstTime.length})</span></div>
                {alerts.firstTime.length ? <ul className="space-y-0.5">{alerts.firstTime.map((p) => <li key={p.payeeId} className="rounded bg-warning-subtle px-2 py-1 text-warning">{p.name} {p.bank ?? ""} {p.account ?? ""} · {won(p.total)}원</li>)}</ul>
                  : <p className="text-muted">없어요</p>}
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2 font-medium text-heading">
                  <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="rounded border px-1 py-0.5 text-xs">
                    {[3, 6, 12].map((m) => <option key={m} value={m}>{m}개월</option>)}
                  </select> 넘게 이체 없는 계좌 <span className="text-muted">({alerts.dormant.length})</span>
                </div>
                {alerts.dormant.length ? <ul className="max-h-40 space-y-0.5 overflow-y-auto">{alerts.dormant.slice(0, 20).map((p) => <li key={p.payeeId} className="flex justify-between gap-2 border-b border-line py-0.5"><span>{p.name} <span className="text-xs text-muted">{p.account ?? ""}</span></span><span className="text-xs text-label">마지막 {p.last}</span></li>)}</ul>
                  : <p className="text-muted">없어요</p>}
              </div>
              <p className="text-xs text-muted">지출의 송금 계좌(payee) 기준 [확인 필요: 알림 기준 개월 수]</p>
            </div>
          )}
        </section>

        <section className={`${card} p-4 lg:overflow-y-auto`}>
          <h3 className={h3}><FontAwesomeIcon icon={faLightbulb} className="text-primary" />수지 인사이트</h3>
          {tips.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{tips.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="text-sm text-muted">아직 데이터가 부족해요.</p>}
          <p className="mt-1 text-xs text-muted">정해진 규칙으로 만든 문장이에요(일반·특별 기준, 작년 같은 기간과 비교).</p>
        </section>
        </div>
      </div>

      <section className={`${card} mt-4 p-4`}>
        <h3 className={h3}>주간 수지 추이 <span className="font-normal text-muted">(최근 12주)</span></h3>
        <EChart option={weekly} label="최근 12주 수입·지출" />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className={`${card} p-4`}><h3 className={h3}>수입 · 작년 동월 대비</h3><EChart option={incMonth} label="월별 수입 올해·작년" /></section>
        <section className={`${card} p-4`}><h3 className={h3}>지출 · 작년 동월 대비</h3><EChart option={expMonth} label="월별 지출 올해·작년" /></section>
      </div>

      <section className={`${card} mt-4 p-4`}>
        <h3 className={h3}>분기별 수입 / 지출 <span className="font-normal text-muted">({year} · {year - 1})</span></h3>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2"><EChart option={quarter.option} label="분기별 수입·지출" /></div>
          <table className="w-full self-start text-sm">
            <thead className="bg-surface-2 text-xs text-label"><tr><th className="px-2 py-1.5 text-left">분기</th><th className="text-right">수입</th><th className="text-right">작년</th><th className="text-right">지출</th><th className="px-2 text-right">작년</th></tr></thead>
            <tbody>{quarter.rows.map((r) => (
              <tr key={r.q} className="border-t"><td className="px-2 py-1">{r.q}분기</td><td className="text-right">{man(r.income)}</td><td className="text-right text-muted">{man(r.pi)}</td><td className="text-right">{man(r.expense)}</td><td className="px-2 text-right text-muted">{man(r.pe)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className={`${card} p-4`}>
          <h3 className={h3}>부서별 지출 <span className="font-normal text-muted">(올해 누계 · 작년 같은 기간)</span></h3>
          {dept.rows.length ? <EChart option={dept.option} className="h-80" label="부서별 지출 올해·작년" /> : <p className="text-sm text-muted">지출이 없어요.</p>}
        </section>
        <section className={`${card} p-4`}>
          <h3 className={h3}>헌금구분별 헌금 <span className="font-normal text-muted">(올해 누계 · 작년 같은 기간)</span></h3>
          {types.rows.length ? <EChart option={types.option} className="h-80" label="헌금구분별 헌금 올해·작년" /> : <p className="text-sm text-muted">수입이 없어요.</p>}
        </section>
      </div>
    </>
  );
}
