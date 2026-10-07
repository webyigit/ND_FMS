// 기부금영수증 발행번호: {연도}-{PN|CP}{일련번호3자리}-{MMDD}  예) 2026-PN001-1007
export type DonorKind = "PN" | "CP";

export function receiptNo(year: number, kind: DonorKind, serial: number, issuedAt: Date): string {
  const mm = String(issuedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(issuedAt.getDate()).padStart(2, "0");
  return `${year}-${kind}${String(serial).padStart(3, "0")}-${mm}${dd}`;
}

export function nextSerial(existing: string[], year: number, kind: DonorKind): number {
  const re = new RegExp(`^${year}-${kind}(\\d+)-`);
  return existing.reduce((max, no) => Math.max(max, Number(no.match(re)?.[1] ?? 0)), 0) + 1;
}
