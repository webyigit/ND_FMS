"use client";
// 연도 고르기 (올해 기준 앞뒤 범위)
export default function YearSelect({ value, onChange, from = 2020, to = new Date().getFullYear() + 1 }: { value: number; onChange: (y: number) => void; from?: number; to?: number }) {
  const years = Array.from({ length: to - from + 1 }, (_, i) => to - i);
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="rounded border px-2 py-1.5 text-sm text-heading">
      {years.map((y) => <option key={y} value={y}>{y}년</option>)}
    </select>
  );
}
