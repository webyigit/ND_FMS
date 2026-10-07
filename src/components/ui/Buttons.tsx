"use client";
// 화면 상단 공통 버튼: 엑셀 저장, 출력·PDF (출력 시 .no-print 숨김)
export function ExcelButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="no-print rounded border bg-surface px-3 py-1.5 text-sm disabled:opacity-50">엑셀 저장</button>;
}
export function PrintButton() {
  return <button onClick={() => window.print()} className="no-print rounded bg-primary px-3 py-1.5 text-sm text-white">출력·PDF</button>;
}
export const btn = "rounded border bg-surface px-3 py-1.5 text-sm disabled:opacity-50";
export const btnPrimary = "rounded bg-primary px-3 py-1.5 text-sm text-white disabled:bg-slate-300";
export const input = "rounded border px-2 py-1.5 text-sm text-heading";
export const card = "rounded-lg bg-surface shadow-card";
