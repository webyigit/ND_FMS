"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { FUNDS, MONTHS, type Fund } from "@/lib/income/report";

echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

// 기금별 색: 디자인가이드 차트 토큰(--chart-1~3)
const TOKEN: Record<Fund, [string, string]> = { 일반: ["--chart-1", "#1ea951"], 특별: ["--chart-2", "#1b98b5"], 별도: ["--chart-3", "#7f74f2"] };
const man = (v: number) => `${Math.round(v / 10000).toLocaleString("ko-KR")}만`;

/** 월별 수입 막대(기금별 쌓기) */
export default function FundMonthChart({ byFund }: { byFund: Record<Fund, number[]> }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const css = getComputedStyle(document.documentElement);
    const color = (f: Fund) => css.getPropertyValue(TOKEN[f][0]).trim() || TOKEN[f][1];
    const chart = echarts.init(el.current, undefined, { renderer: "svg" });
    chart.setOption({
      animation: false,
      grid: { left: 56, right: 16, top: 36, bottom: 28 },
      legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: "#475569" } },
      tooltip: { trigger: "axis", valueFormatter: (v: number) => `${v.toLocaleString("ko-KR")}원` },
      xAxis: { type: "category", data: MONTHS, axisTick: { show: false }, axisLine: { lineStyle: { color: "#cbd5e1" } }, axisLabel: { color: "#64748b" } },
      yAxis: { type: "value", axisLabel: { formatter: man, color: "#64748b" }, splitLine: { lineStyle: { color: "#eef2f6" } } },
      series: FUNDS.map((f) => ({ name: f, type: "bar", stack: "fund", data: byFund[f], itemStyle: { color: color(f) }, barMaxWidth: 22 })),
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [byFund]);
  return <div ref={el} className="h-64 w-full" role="img" aria-label="월별 기금별 수입" />;
}
