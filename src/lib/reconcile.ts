// 검증시트: 은행잔고와 장부잔액이 맞는지 확인(원본 '검증' 시트 로직)
export type ReconcileInput = {
  bankBalance: number; // A 농협 통장 잔액
  pendingDeposit: number; // B 입금 예정액
  missionUnremitted: number; // D 해외선교 미입금 잔액
  ledgerBalance: number; // F 장부 잔액 누계
  baseSurplus: number; // H 기준 잉여금(전년 이월)
};

export function reconcile(i: ReconcileInput) {
  const realBalance = i.bankBalance + i.pendingDeposit; // C
  const accountBalance = realBalance - i.missionUnremitted; // E
  const available = accountBalance - i.ledgerBalance; // G
  const diff = available - i.baseSurplus;
  return { realBalance, accountBalance, available, diff, ok: diff === 0 };
}

/** G − H 판정: 0이면 일치, 모자라면 부족. 남는 경우의 이름은 원본에 없음 [확인 필요] */
export function verdict(diff: number): { label: "일치" | "부족" | "초과"; amount: number } {
  if (diff === 0) return { label: "일치", amount: 0 };
  return diff < 0 ? { label: "부족", amount: -diff } : { label: "초과", amount: diff };
}

/** DB(v_reconciliation) 행 → 계산 입력. 비어 있는 칸은 0 */
export type ReconRow = {
  bank_balance: number | string | null; pending_deposit: number | string | null; mission_unremitted: number | string | null;
  base_surplus: number | string | null; ledger_balance: number | string | null;
};
export const fromReconRow = (r: ReconRow): ReconcileInput => ({
  bankBalance: Number(r.bank_balance ?? 0),
  pendingDeposit: Number(r.pending_deposit ?? 0),
  missionUnremitted: Number(r.mission_unremitted ?? 0),
  ledgerBalance: Number(r.ledger_balance ?? 0),
  baseSurplus: Number(r.base_surplus ?? 0),
});

/** 은행거래내역에서 A 통장 잔액 뽑기: 그 주일(포함)까지의 마지막 거래 잔액. 거래가 없으면 null */
export type BalanceTx = { id: number; tx_at: string; tx_date: string; balance: number | string | null };
export function lastBankBalance(txs: BalanceTx[], sunday: string): { balance: number; txAt: string } | null {
  const hit = txs
    .filter((t) => t.tx_date <= sunday && t.balance != null)
    .sort((a, b) => Date.parse(b.tx_at) - Date.parse(a.tx_at) || b.id - a.id)[0];
  return hit ? { balance: Number(hit.balance), txAt: hit.tx_at } : null;
}
