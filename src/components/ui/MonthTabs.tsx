"use client";
// 과거 내역 화면의 월 탭: [전체][1월]…[12월]. value 0 = 전체
export const thisMonth = () => new Date().getMonth() + 1;

export default function MonthTabs({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <div role="tablist" aria-label="월" className="no-print mb-4 flex flex-wrap gap-1 border-b border-line text-sm">
      {Array.from({ length: 13 }, (_, i) => (
        <button key={i} type="button" role="tab" aria-selected={value === i} onClick={() => onChange(i)}
          className={`-mb-px border-b-2 px-3 py-2 font-medium ${value === i ? "border-primary text-primary" : "border-transparent text-label hover:text-heading"}`}>
          {i ? `${i}월` : "전체"}
        </button>
      ))}
    </div>
  );
}
