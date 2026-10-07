// 화면 공통 표기
export const won = (n: number | null | undefined) => (n ?? 0).toLocaleString("ko-KR");
export const pct = (a: number, b: number, digits = 1) => (b ? `${((a / b) * 100).toFixed(digits)}%` : "-");
/** 2026-10-04 → 261004 (파일명용) */
export const yymmdd = (d: string | Date = new Date()) => {
  const s = typeof d === "string" ? d : localDate(d);
  return s.replace(/-/g, "").slice(2, 8);
};
/** 현지 날짜 YYYY-MM-DD (toISOString은 UTC라 오전 9시 전에 하루 밀린다) */
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const thisYear = () => new Date().getFullYear();
/** 금액 입력값 → 숫자 ("1,000" → 1000) */
export const toAmount = (s: string) => Number(String(s).replace(/[^\d-]/g, "")) || 0;
/** 파일명 규칙 {이름}_{YYMMDD}_v{번호} */
export const fileName = (name: string, ext: string, v = 1) => `${name}_${yymmdd()}_v${v}.${ext}`;
