"use client";
import { useMemo } from "react";
import EChart, { C, man, wonTip } from "@/components/charts/EChart";

/** 일반회계 주별 누계(선) vs 예산 균등 진행선(점선). 막대 = 그 주 헌금액 */
export default function ProgressChart({ weeks, budget, totalSundays }: { weeks: { sunday: string; amount: number; cum: number }[]; budget: number; totalSundays: number }) {
  const option = useMemo(() => {
    const labels = weeks.map((w) => `${Number(w.sunday.slice(5, 7))}/${Number(w.sunday.slice(8, 10))}`);
    // 올해 n번째 주일까지의 예산 몫 = 예산 × n / 올해 주일 수
    const first = new Date(`${weeks[0].sunday.slice(0, 4)}-01-01T00:00:00Z`);
    const nth = (d: string) => Math.floor((Date.parse(`${d}T00:00:00Z`) - first.getTime() - ((7 - first.getUTCDay()) % 7) * 86400000) / 604800000) + 1;
    return {
      grid: { left: 60, right: 12, top: 32, bottom: 28 },
      legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: C.text } },
      tooltip: { trigger: "axis", valueFormatter: wonTip },
      xAxis: { type: "category", data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } }, axisLabel: { color: C.axis } },
      yAxis: { type: "value", axisLabel: { formatter: man, color: C.axis }, splitLine: { lineStyle: { color: C.split } } },
      series: [
        { name: "주별 헌금", type: "bar", data: weeks.map((w) => w.amount), itemStyle: { color: C.prev }, barMaxWidth: 10 },
        { name: "총누계", type: "line", data: weeks.map((w) => w.cum), symbol: "none", lineStyle: { color: C.c1, width: 2 }, itemStyle: { color: C.c1 }, areaStyle: { color: "rgba(30,169,81,.08)" } },
        ...(budget ? [{ name: "예산 진행선", type: "line", data: weeks.map((w) => Math.round((budget * nth(w.sunday)) / totalSundays)), symbol: "none", lineStyle: { color: C.c4, width: 1.5, type: "dashed" }, itemStyle: { color: C.c4 } }] : []),
      ],
    };
  }, [weeks, budget, totalSundays]);
  return <EChart option={option} className="h-64" label="일반회계 주별 누계와 예산 진행선" />;
}
