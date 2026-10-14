// 지출입력 임시저장(브라우저)에 다른 화면(은행거래내역·증빙 올리기)이 행을 넣을 때의 규칙
import type { ExpenseRow } from "../db/weekly";
import { expenseSig } from "../db/weekly";

export const DRAFT_KEY = "ndfms.expense.draft";
export const DRAFT_META_KEY = "ndfms.expense.draft.meta";
export type DraftMeta = { sunday: string; savedSig: string | null };

/**
 * 임시저장이 '저장 안 한 입력'이면 그 뒤에 덧붙이고(그 주일 유지),
 * 이미 저장된 것(또는 비어 있음)이면 새로 시작해 기준 주일(workSunday)로 둔다.
 * 돌려주는 sunday 가 단계 완료를 기록할 주일.
 */
export function mergeIntoDraft(cur: ExpenseRow[], meta: DraftMeta | null, add: ExpenseRow[], workSunday: string): { rows: ExpenseRow[]; meta: DraftMeta; sunday: string } {
  const dirty = cur.length > 0 && meta?.savedSig !== expenseSig(cur);
  if (dirty) {
    const sunday = meta?.sunday ?? workSunday;
    return { rows: [...cur, ...add], meta: { sunday, savedSig: meta?.savedSig ?? null }, sunday };
  }
  return { rows: add, meta: { sunday: workSunday, savedSig: null }, sunday: workSunday };
}

/** 은행 출금 거래 → 지출 행 (부서·항목은 지출입력에서 고른다) */
export function rowFromBankTx(t: { id: number; withdraw: number; description: string | null; transfer_memo: string | null; tx_memo: string | null; tx_date: string }, newId: () => string): ExpenseRow {
  const content = (t.transfer_memo || t.tx_memo || t.description || "").trim();
  const memo = [t.description?.trim(), t.tx_date].filter((x) => x && x !== content).join(" · ");
  return { id: newId(), content, amount: Number(t.withdraw), dept: "", item: "", requester: "", memo, source: "은행", bankTxId: t.id };
}

export function appendToDraft(add: ExpenseRow[], workSunday: string): string {
  let cur: ExpenseRow[] = [], meta: DraftMeta | null = null;
  try { cur = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "[]"); } catch {}
  try { meta = JSON.parse(localStorage.getItem(DRAFT_META_KEY) ?? "null"); } catch {}
  const r = mergeIntoDraft(cur, meta, add, workSunday);
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(r.rows)); localStorage.setItem(DRAFT_META_KEY, JSON.stringify(r.meta)); } catch {}
  return r.sunday;
}
