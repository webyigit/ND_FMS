// 발행현황 검색·기부금 관리대장
import { rrnFrontQuery } from "./validate";

export type ReceiptStatus = "issued" | "not_issued" | "canceled" | "reissued";
export const STATUS_LABEL: Record<ReceiptStatus, [string, string]> = {
  issued: ["발행", "bg-success-subtle text-success"],
  not_issued: ["발행안함", "bg-surface-2 text-muted"],
  canceled: ["취소", "bg-danger-subtle text-danger"],
  reissued: ["재발행됨", "bg-warning-subtle text-warning"],
};

export type LedgerRow = {
  serial_no: string; donor_name: string | null; donor_kind: string | null;
  donor_rrn_masked: string | null; rrn_front: string | null; donor_brn: string | null;
  donor_address: string | null; issued_amount: number | null; issued_at: string | null; status: ReceiptStatus;
};

/** 이름·금액·주소·주민번호 앞 6자리·발행번호로 찾기 */
export function matchReceipt(r: LedgerRow, q: string): boolean {
  const s = q.trim();
  if (!s) return true;
  const front = rrnFrontQuery(s);
  if (front) return r.rrn_front === front;
  const num = s.replace(/[,원\s]/g, "");
  if (/^\d+$/.test(num) && num.length >= 3 && String(r.issued_amount ?? "").includes(num)) return true;
  return [r.donor_name, r.donor_address, r.serial_no, r.donor_brn].some((v) => v?.includes(s));
}

export const LEDGER_HEAD = ["발행번호", "성명(법인명)", "주민번호(사업자번호)", "발행금액", "발행일", "상태"];
export function ledgerRows(rows: LedgerRow[]): (string | number)[][] {
  return rows.map((r) => [
    r.serial_no, r.donor_name ?? "",
    (r.donor_kind === "CP" ? r.donor_brn : r.donor_rrn_masked) ?? "",
    r.issued_amount ?? 0, r.issued_at ?? "", STATUS_LABEL[r.status]?.[0] ?? r.status,
  ]);
}
/** 관리대장 합계는 취소·재발행됨을 뺀 발행 건만 */
export const ledgerTotal = (rows: LedgerRow[]) => rows.filter((r) => r.status === "issued").reduce((s, r) => s + (r.issued_amount ?? 0), 0);
