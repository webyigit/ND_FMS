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
