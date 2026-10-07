// 은행거래내역 → 수입 반영: 분류 제안, 올리기·반영 payload
import type { BankTx } from "../bank/nonghyup";
import { classifyDeposit, type HistoryHit, type MemberRef, type OfferingKeyword } from "../classify";
import { isSunday } from "./dates";

export type Suggestion = { typeId: number | null; memberId: number | null; payerLabel: string; source: "history" | "keyword" | "none" };

/** 적요 → 헌금구분·대표 교인·표기 제안. 가족 묶음은 첫 사람을 대표로, 표기는 "가,나" */
export function suggest(description: string, keywords: OfferingKeyword[], members: MemberRef[], history: HistoryHit[] = []): Suggestion {
  const c = classifyDeposit(description, keywords, members, history);
  const names = c.memberIds.map((id) => members.find((m) => m.id === id)?.name).filter((n): n is string => !!n);
  return {
    typeId: c.offeringTypeId,
    memberId: c.memberIds[0] ?? null,
    payerLabel: names.length ? names.join(",") : c.rest || description.trim(),
    source: c.source,
  };
}

/** import_bank_tx 에 넘길 행 (입금만 분류 제안을 붙인다) */
export const toImportRows = (txs: BankTx[], sug: (t: BankTx) => Suggestion | null) =>
  txs.map((t) => {
    const s = t.deposit > 0 ? sug(t) : null;
    return {
      tx_at: t.txAt, withdraw: t.withdraw, deposit: t.deposit, balance: t.balance,
      tx_type: t.txType, description: t.description, branch: t.branch, transfer_memo: t.transferMemo, tx_memo: t.txMemo,
      suggested_offering_type_id: s?.typeId ?? null, suggested_member_id: s?.memberId ?? null,
    };
  });

export type LinkDraft = { txId: number; description: string; typeId: number | null; memberId: number | null; payerLabel: string; memo: string; sunday: string };

/** 반영 전에 고칠 것 */
export const linkProblems = (ds: LinkDraft[]) =>
  ds.flatMap((d) => {
    const why = [!d.typeId && "헌금구분 없음", !isSunday(d.sunday) && "주일 날짜 아님"].filter(Boolean);
    return why.length ? [`${d.description || d.txId}: ${why.join("·")}`] : [];
  });

export const toLinkPayload = (ds: LinkDraft[]) =>
  ds.map((d) => ({
    bank_tx_id: d.txId, offering_type_id: d.typeId, member_id: d.memberId,
    payer_label: d.payerLabel.trim() || null, memo: d.memo.trim() || null, sunday: d.sunday,
  }));
