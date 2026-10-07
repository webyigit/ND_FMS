// 지출증빙 올리기: 파일 종류 판별 + 엑셀 지출내역 열 자동 인식
import { parseAmount, parseNonghyupRows } from "./bank/nonghyup";

export type UploadKind = "pdf" | "image" | "excel" | "csv" | "unsupported";
export const ACCEPT = ".pdf,image/*,.heic,.heif,.xlsx,.csv";

export function fileKind(name: string, mime = ""): UploadKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp"].includes(ext)) return "image";
  if (ext === "xlsx") return "excel";
  if (ext === "csv") return "csv";
  return "unsupported"; // .xls(구형)는 엑셀에서 xlsx로 다시 저장 후 업로드
}

export type SheetExpense = { date: string; content: string; amount: number; dept: string; item: string; requester: string; memo: string };
type Cell = string | number | Date | null | undefined;

// 열 제목 별칭 (원본 엑셀·부서 양식마다 표기가 달라 넓게 받는다)
const ALIAS: Record<keyof SheetExpense, string[]> = {
  date: ["일자", "날짜", "거래일", "거래일시", "지출일", "사용일"],
  content: ["내용", "적요", "품명", "사용내역", "지출내용", "거래기록사항"],
  amount: ["금액", "지출액", "지출금액", "출금", "출금액", "출금(원)", "사용금액", "합계"],
  dept: ["부서", "구분(부서)", "구분"],
  item: ["항목", "(항목)", "세목", "계정"],
  requester: ["청구자", "신청자", "요청자", "사용자"],
  memo: ["비고", "메모", "이체메모"],
};
const norm = (v: Cell) => String(v ?? "").replace(/\s/g, "");

/** 제목 줄을 찾아 열 위치를 돌려준다. 내용·금액 열이 모두 있어야 인정 */
export function findHeader(rows: Cell[][], scan = 30) {
  for (let r = 0; r < Math.min(rows.length, scan); r++) {
    const cells = rows[r].map(norm);
    const col: Partial<Record<keyof SheetExpense, number>> = {};
    (Object.keys(ALIAS) as (keyof SheetExpense)[]).forEach((k) => {
      const i = cells.findIndex((c) => ALIAS[k].includes(c));
      if (i >= 0) col[k] = i;
    });
    if (col.content !== undefined && col.amount !== undefined) return { row: r, col };
  }
  return null;
}

const toDate = (v: Cell) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v ?? "").match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
};

export type SheetResult = { format: "농협" | "일반"; rows: SheetExpense[]; skipped: number } | { format: "인식불가"; rows: []; skipped: 0 };

/** 농협 거래내역이면 출금만, 아니면 제목 줄 기준으로 읽는다. 합계·소계 줄과 금액 0은 건너뛴다 */
export function parseExpenseSheet(rows: Cell[][], fileName = ""): SheetResult {
  const flat = rows.slice(0, 20).map((r) => r.map(norm).join("|")).join("\n");
  if (/^농협_/.test(fileName.normalize("NFC")) || (flat.includes("거래후잔액") && flat.includes("거래기록사항"))) {
    const tx = parseNonghyupRows(rows as never).filter((t) => t.withdraw > 0);
    return {
      format: "농협", skipped: 0,
      rows: tx.map((t) => ({ date: t.txAt.slice(0, 10), content: t.transferMemo || t.txMemo || t.description, amount: t.withdraw, dept: "", item: "", requester: "", memo: t.description })),
    };
  }
  const h = findHeader(rows);
  if (!h) return { format: "인식불가", rows: [], skipped: 0 };
  const get = (r: Cell[], k: keyof SheetExpense) => (h.col[k] === undefined ? "" : r[h.col[k]!]);
  const out: SheetExpense[] = [];
  let skipped = 0;
  for (const r of rows.slice(h.row + 1)) {
    const content = String(get(r, "content") ?? "").trim();
    const amount = parseAmount(get(r, "amount") as never);
    if (!content && !amount) continue;
    if (!amount || /합\s*계|소\s*계|총\s*계/.test(content + norm(get(r, "dept")))) { skipped++; continue; }
    out.push({
      date: toDate(get(r, "date")), content, amount,
      dept: String(get(r, "dept") ?? "").trim(), item: String(get(r, "item") ?? "").trim(),
      requester: String(get(r, "requester") ?? "").trim(), memo: String(get(r, "memo") ?? "").trim(),
    });
  }
  return { format: "일반", rows: out, skipped };
}

/** 간단 CSV 파서(따옴표 안 쉼표 처리) */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); out.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out;
}
