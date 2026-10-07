// 송금 계좌 찾기: 지출입력의 송금파일 생성에서 쓴다. 계좌번호는 재정부원만 복호화된다(DB 함수 payee_accounts).
import type { SupabaseClient } from "@supabase/supabase-js";

export type PayeeAccount = { id: number; name: string; member_name: string | null; bank: string | null; holder: string | null; account_no: string };

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s/g, "");

/** 후보 중 가장 알맞은 계좌: 송금 이름 > 연결 교인 이름 > 예금주. 같은 순위가 여럿이면 처음 등록한 것 */
export function pickPayee(rows: PayeeAccount[], name: string): PayeeAccount | null {
  const k = norm(name);
  if (!k) return null;
  const score = (r: PayeeAccount) =>
    norm(r.name) === k ? 3 : norm(r.member_name) === k ? 2 : norm(r.holder) === k ? 1 : 0;
  let best: PayeeAccount | null = null;
  for (const r of [...rows].sort((a, b) => a.id - b.id)) if (score(r) > (best ? score(best) : 0)) best = r;
  return best;
}

/** 여러 이름을 한 번에 찾는다: Map(입력 이름 → 계좌). 못 찾은 이름은 Map에 없다 */
export async function findPayeeAccounts(sb: SupabaseClient, names: string[]): Promise<Map<string, PayeeAccount>> {
  const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const out = new Map<string, PayeeAccount>();
  if (!uniq.length) return out;
  const { data, error } = await sb.rpc("payee_accounts", { p_names: uniq });
  if (error) throw error;
  const rows = ((data ?? []) as PayeeAccount[]).map((r) => ({ ...r, id: Number(r.id) }));
  for (const n of uniq) {
    const p = pickPayee(rows, n);
    if (p) out.set(n, p);
  }
  return out;
}

/** 이름으로 송금 계좌 하나 찾기 (없으면 null) */
export async function findPayeeAccount(sb: SupabaseClient, name: string): Promise<PayeeAccount | null> {
  return (await findPayeeAccounts(sb, [name])).get(name.trim()) ?? null;
}

/** 계좌번호 입력값 정리: 숫자·하이픈만 */
export const cleanAccountNo = (s: string) => s.replace(/[^\d-]/g, "");
/** 저장 가능한 계좌번호인지(숫자 6자리 이상) */
export const isAccountNo = (s: string) => cleanAccountNo(s).replace(/-/g, "").length >= 6;

export const ACCOUNT_KINDS = ["일반", "대출", "외화", "적금"] as const;
