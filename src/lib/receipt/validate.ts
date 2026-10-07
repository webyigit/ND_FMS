// 입력값 정리: 주민번호·휴대폰·사업자번호 (평문은 화면 입력 중에만, 저장은 DB에서 암호화)
const digits = (s: string) => (s ?? "").replace(/\D/g, "");

/** 13자리 → 900101-1234567, 아니면 null */
export function normalizeRrn(s: string): string | null {
  const d = digits(s);
  return /^\d{6}[1-8]\d{6}$/.test(d) ? `${d.slice(0, 6)}-${d.slice(6)}` : null;
}
/** 화면 표시용: 900101-1****** */
export function maskRrn(s: string): string {
  const d = digits(s);
  return d.length >= 7 ? `${d.slice(0, 6)}-${d[6]}******` : d;
}
/** 검색어에서 주민번호 앞 6자리만 쓴다(뒤자리로는 찾지 않는다) */
export function rrnFrontQuery(q: string): string | null {
  const m = q.trim().match(/^(\d{6})(?:-?\d*)?$/);
  return m ? m[1] : null;
}

/** 010-1234-5678 형식, 아니면 null */
export function normalizePhone(s: string): string | null {
  const d = digits(s);
  if (!/^01\d{8,9}$/.test(d)) return null;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
}

/** 사업자등록번호 123-45-67890, 아니면 null */
export function normalizeBrn(s: string): string | null {
  const d = digits(s);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : null;
}
/** 사업자등록번호 검증번호(마지막 자리) 확인. 틀려도 저장은 막지 않고 알림만. */
export function brnChecksumOk(s: string): boolean {
  const d = digits(s);
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = w.reduce((acc, k, i) => acc + Number(d[i]) * k, 0);
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}

/** 쉼표·공백으로 적은 가족명단 → 배열(최대 10명) */
export function splitNames(s: string): string[] {
  return [...new Set(s.split(/[,，/·\s]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 10);
}
