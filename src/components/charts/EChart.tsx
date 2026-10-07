"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

// 디자인가이드 차트 토큰(--chart-*)
export const C = { in: "#17a08c", out: "#e5464f", c1: "#1ea951", c2: "#1b98b5", c3: "#7f74f2", c4: "#cf721a", c5: "#e8358a", prev: "#cbd5e1", axis: "#64748b", line: "#cbd5e1", split: "#eef2f6", text: "#475569" };
export const man = (v: number) => `${Math.round(v / 10000).toLocaleString("ko-KR")}만`;
export const wonTip = (v: number) => `${Number(v).toLocaleString("ko-KR")}원`;

/** ECharts(svg) 공통 틀: option만 넘기면 크기 맞춤·정리까지 */
export default function EChart({ option, className = "h-64", label }: { option: EChartsCoreOption; className?: string; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, undefined, { renderer: "svg" });
    chart.setOption({ animation: false, textStyle: { fontFamily: "inherit" }, ...option });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [option]);
  return <div ref={el} className={`w-full ${className}`} role="img" aria-label={label} />;
}

const legend = { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: C.text } };
const catAxis = (data: string[]) => ({ type: "category", data, axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel: { color: C.axis } });
const valAxis = { type: "value", axisLabel: { formatter: man, color: C.axis }, splitLine: { lineStyle: { color: C.split } } };
const bar = (name: string, data: number[], color: string) => ({ name, type: "bar", data, itemStyle: { color, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 16 });

/** 수입·지출 막대 + 수지차 선 */
export const flowOption = (labels: string[], income: number[], expense: number[]): EChartsCoreOption => ({
  grid: { left: 56, right: 12, top: 32, bottom: 28 }, legend,
  tooltip: { trigger: "axis", valueFormatter: wonTip },
  xAxis: catAxis(labels), yAxis: valAxis,
  series: [bar("수입", income, C.in), bar("지출", expense, C.out),
    { name: "수지차", type: "line", data: income.map((v, i) => v - expense[i]), itemStyle: { color: C.c3 }, lineStyle: { width: 2 }, symbolSize: 5 }],
});

/** 올해·작년 비교 막대 (세로) */
export const compareOption = (labels: string[], cur: number[], prev: number[], color: string, curName = "올해", prevName = "작년"): EChartsCoreOption => ({
  grid: { left: 56, right: 12, top: 32, bottom: 28 }, legend,
  tooltip: { trigger: "axis", valueFormatter: wonTip },
  xAxis: catAxis(labels), yAxis: valAxis,
  series: [bar(prevName, prev, C.prev), bar(curName, cur, color)],
});

/** 올해·작년 비교 가로 막대 (이름이 긴 부서·헌금구분) */
export const compareHOption = (labels: string[], cur: number[], prev: number[], color: string): EChartsCoreOption => ({
  grid: { left: 96, right: 16, top: 28, bottom: 20 }, legend,
  tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: wonTip },
  yAxis: { ...catAxis([...labels].reverse()), axisLabel: { color: C.axis, width: 88, overflow: "truncate" } },
  xAxis: valAxis,
  series: [
    { ...bar("작년", [...prev].reverse(), C.prev), itemStyle: { color: C.prev, borderRadius: [0, 3, 3, 0] }, barMaxWidth: 10 },
    { ...bar("올해", [...cur].reverse(), color), itemStyle: { color, borderRadius: [0, 3, 3, 0] }, barMaxWidth: 10 },
  ],
});
