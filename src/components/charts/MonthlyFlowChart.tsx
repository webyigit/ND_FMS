"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, MarkAreaComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, MarkAreaComponent, SVGRenderer]);

// 디자인가이드 차트 토큰(--chart-in / --chart-out / --chart-3)
const IN = "#17a08c", OUT = "#e5464f", NET = "#7f74f2";
const man = (v: number) => `${Math.round(v / 10000).toLocaleString("ko-KR")}만`;

/** 월별 수입·지출 막대 + 수지차 선. highlight 구간(예: 7~12월)은 배경으로 강조 */
export default function MonthlyFlowChart({ data, months, highlight }: { data: { month: number; income: number; expense: number }[]; months: number[]; highlight?: [number, number] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, undefined, { renderer: "svg" });
    const rows = data.filter((d) => months.includes(d.month));
    chart.setOption({
      animation: false,
      grid: { left: 56, right: 16, top: 36, bottom: 28 },
      legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: "#475569" } },
      tooltip: { trigger: "axis", valueFormatter: (v: number) => `${v.toLocaleString("ko-KR")}원` },
      xAxis: { type: "category", data: rows.map((d) => `${d.month}월`), axisTick: { show: false }, axisLine: { lineStyle: { color: "#cbd5e1" } }, axisLabel: { color: "#64748b" } },
      yAxis: { type: "value", axisLabel: { formatter: man, color: "#64748b" }, splitLine: { lineStyle: { color: "#eef2f6" } } },
      series: [
        { name: "수입(일반·특별)", type: "bar", data: rows.map((d) => d.income), itemStyle: { color: IN, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 18,
          markArea: highlight ? { silent: true, itemStyle: { color: "rgba(127,116,242,0.06)" }, data: [[{ xAxis: `${highlight[0]}월` }, { xAxis: `${highlight[1]}월` }]] } : undefined },
        { name: "지출", type: "bar", data: rows.map((d) => d.expense), itemStyle: { color: OUT, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 18 },
        { name: "수지차", type: "line", data: rows.map((d) => d.income - d.expense), itemStyle: { color: NET }, lineStyle: { width: 2 }, symbolSize: 5 },
      ],
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [data, months, highlight]);
  return <div ref={el} className="h-64 w-full" role="img" aria-label="월별 수입·지출 추이" />;
}
