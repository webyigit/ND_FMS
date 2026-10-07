// 숫자 → 한글 금액 (예: 160,500,000 → "일억육천오십만원")
const DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SMALL = ["", "십", "백", "천"];
const BIG = ["", "만", "억", "조", "경"];

export function koreanAmount(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "영원";
  let out = "";
  for (let g = 0; n > 0; g++, n = Math.floor(n / 10000)) {
    const chunk = n % 10000;
    if (!chunk) continue;
    let s = "";
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(chunk / 10 ** i) % 10;
      if (d) s += DIGITS[d] + SMALL[i];
    }
    out = s + BIG[g] + out;
  }
  return out + "원";
}
