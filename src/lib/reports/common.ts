// 보고서 공통: 주 단위 집계 행과 날짜 계산 (DB·데모 모두 이 모양으로 바꿔서 쓴다)
export type Fund = "일반" | "특별" | "별도";
export const FUND_OF: Record<string, Fund> = { general: "일반", special: "특별", separate: "별도" };
export const fundOf = (kind: string | null | undefined): Fund => FUND_OF[kind ?? "general"] ?? "일반";

/** 주일 × 헌금구분 합계 */
export type IncWeek = { sunday: string; type: string; typeOrder?: number; fund: Fund; amount: number };
/** 주일 × 부서·항목 합계 */
export type ExpWeek = { sunday: string; dept: string; deptOrder?: number; item: string; itemOrder?: number; fund: Fund; amount: number };

export const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
/** 일반·특별(교회 운영)만. 별도 기금(해외선교·네팔)은 따로 본다 */
export const operating = (r: { fund: Fund }) => r.fund !== "별도";

const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (s: string) => new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))));
const fromDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (s: string, n: number) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fromDate(d); };
/** 그 날짜가 속한 주의 주일(그날 또는 그 전 일요일) */
export const sundayOf = (s: string) => addDays(s, -toDate(s).getUTCDay());
export const monthOf = (s: string) => Number(s.slice(5, 7));
export const yearOf = (s: string) => Number(s.slice(0, 4));
export const quarterOf = (s: string) => Math.ceil(monthOf(s) / 3);
/** n개월 뒤(음수면 전) 같은 날, 말일 보정 */
export function addMonths(s: string, n: number) {
  const y = yearOf(s), m = monthOf(s) - 1 + n, d = Number(s.slice(8, 10));
  const ty = y + Math.floor(m / 12), tm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, last))}`;
}
/** 작년 같은 날 (2/29 → 2/28) */
export const lastYearSameDay = (s: string) => addMonths(s, -12);

/** 증감 표기: +12.3% / −4.0% / 신규 */
export function change(cur: number, prev: number) {
  if (!prev) return cur ? "신규" : "-";
  const r = ((cur - prev) / Math.abs(prev)) * 100;
  return `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}%`;
}
/** 만원 단위 짧은 표기 (차트 축) */
export const man = (v: number) => `${Math.round(v / 10000).toLocaleString("ko-KR")}만`;
/** 표 금액: 0은 '-' */
export const wonOrDash = (n: number) => (n ? n.toLocaleString("ko-KR") : "-");
