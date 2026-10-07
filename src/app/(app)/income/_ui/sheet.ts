// 수입 장표 공통 표 스타일(화면·A4 출력 같이)
export const th = "border border-line bg-surface-2 px-2 py-1 text-center font-semibold";
export const td = "border border-line px-2 py-1";
export const tdNum = `${td} text-right tabular-nums`;
export const amt = (n: number | null | undefined) => (n ? n.toLocaleString("ko-KR") : "-");
/** 2026-10-11 → 2026년 10월 11일 */
export const longDate = (d: string) => `${Number(d.slice(0, 4))}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
