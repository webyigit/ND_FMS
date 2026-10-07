// 날짜 계산(문자열 YYYY-MM-DD 기준, 시간대 영향 없이)
const day = (d: string) => new Date(`${d}T00:00:00Z`);
const ymd = (t: Date) => t.toISOString().slice(0, 10);

/** 거래 시각(ISO, 어떤 시간대든) → 한국 날짜 */
export const kstDate = (iso: string) => ymd(new Date(new Date(iso).getTime() + 9 * 3600_000));
/** 거래 시각 → 한국 시각 "YYYY-MM-DD HH:MM" */
export const kstDateTime = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
export const weekday = (d: string) => day(d).getUTCDay();
export const addDays = (d: string, n: number) => { const t = day(d); t.setUTCDate(t.getUTCDate() + n); return ymd(t); };
export const isSunday = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && weekday(d) === 0;

/** 반영 주일: 주일이면 그날, 아니면 직전 주일(prev) 또는 다음 주일(next). 기본 prev [확인 필요] */
export function sundayOf(d: string, mode: "prev" | "next" = "prev") {
  const w = weekday(d);
  if (!w) return d;
  return addDays(d, mode === "prev" ? -w : 7 - w);
}
