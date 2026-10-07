// 주일 날짜 도우미 (YYYY-MM-DD 문자열, 현지 날짜 기준)
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const isSunday = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && parse(s).getDay() === 0;
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
/** 그 날짜가 속한 주의 주일(그 날짜 이전 가장 가까운 주일) */
export const sundayOf = (s: string) => addDays(s, -parse(s).getDay());
/** 2026-10-04 → 2026년 10월 4일 */
export const koDate = (s: string) => { const d = parse(s); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
