// 농협 입출금거래내역 엑셀 파싱. 헤더 행(거래일시...)을 찾아 그 아래를 거래로 읽는다.
// 파일마다 메타 행 수·병합 셀이 달라서 헤더 위치와 열 위치를 이름으로 찾는다.

export type BankTx = {
  txAt: string; // ISO (KST 기준 로컬 시각)
  withdraw: number;
  deposit: number;
  balance: number | null;
  txType: string; // 거래내용
  description: string; // 거래기록사항
  branch: string;
  transferMemo: string;
  txMemo: string;
};

const HEADERS = {
  txAt: "거래일시",
  withdraw: "출금금액",
  deposit: "입금금액",
  balance: "거래후잔액",
  txType: "거래내용",
  description: "거래기록사항",
  branch: "거래점",
  transferMemo: "이체메모",
  txMemo: "거래메모",
} as const;

type Cell = string | number | Date | null | undefined;

const norm = (v: Cell) => (v == null ? "" : String(v).replace(/\s+/g, ""));

export function parseAmount(v: Cell): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[,원\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function parseDateTime(v: Cell): string {
  if (v instanceof Date) return v.toISOString();
  const m = String(v ?? "").match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) throw new Error(`거래일시 형식 오류: ${v}`);
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  const p = (x: string) => x.padStart(2, "0");
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(s)}+09:00`;
}

/** rows: 시트의 2차원 값 배열(행 우선). 병합 셀은 첫 칸에만 값이 있다고 가정 */
export function parseNonghyupRows(rows: Cell[][]): BankTx[] {
  const headerIdx = rows.findIndex((r) => r.some((c) => norm(c) === HEADERS.txAt));
  if (headerIdx < 0) throw new Error("농협 거래내역 헤더(거래일시)를 찾지 못했습니다");
  const header = rows[headerIdx].map(norm);
  const col = Object.fromEntries(
    Object.entries(HEADERS).map(([k, label]) => [k, header.indexOf(label)]),
  ) as Record<keyof typeof HEADERS, number>;
  if (col.withdraw < 0 || col.deposit < 0) throw new Error("출금/입금 열이 없습니다");

  const get = (r: Cell[], k: keyof typeof HEADERS) => (col[k] >= 0 ? r[col[k]] : "");
  const out: BankTx[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const at = get(r, "txAt");
    if (!at || !/\d{4}/.test(String(at))) continue; // 합계/빈 행 건너뜀
    out.push({
      txAt: parseDateTime(at),
      withdraw: parseAmount(get(r, "withdraw")),
      deposit: parseAmount(get(r, "deposit")),
      balance: get(r, "balance") === "" ? null : parseAmount(get(r, "balance")),
      txType: String(get(r, "txType") ?? "").trim(),
      description: String(get(r, "description") ?? "").trim(),
      branch: String(get(r, "branch") ?? "").trim(),
      transferMemo: String(get(r, "transferMemo") ?? "").trim(),
      txMemo: String(get(r, "txMemo") ?? "").trim(),
    });
  }
  return out;
}

export const isNonghyupFile = (fileName: string) => /^농협_/.test(fileName.normalize("NFC"));
