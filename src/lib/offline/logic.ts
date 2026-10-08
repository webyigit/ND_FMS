// 오프라인 동기화의 순수 로직 (브라우저 API 없음, 단위 테스트 대상)
import type { ExpenseRow, IncomeEntry } from "../db/weekly";

export type Kind = "income" | "expense";
export type Rows<K extends Kind = Kind> = K extends "income" ? IncomeEntry[] : ExpenseRow[];

/** 올릴 입력 하나: 어느 사용자가, 어느 주일의, 어떤 종류를, 무엇을 기준으로(baseSig) 바꿨는지 */
export type OutboxItem = {
  id?: number;
  uid: string;
  kind: Kind;
  sunday: string;
  rows: IncomeEntry[] | ExpenseRow[];
  /** 입력을 시작할 때 서버에 있던 내용의 서명. null = 서버 내용을 한 번도 못 받은 상태에서 입력 */
  baseSig: string | null;
  queuedAt: string;
  updatedAt: string;
  status: "pending" | "conflict" | "error";
  /** 충돌·오류 이유 (사람이 읽는 문장) */
  reason?: string;
  /** 충돌 때 서버에 있던 내용 */
  serverRows?: IncomeEntry[] | ExpenseRow[];
  /** true 면 다음 동기화에서 서버 내용을 확인하지 않고 내 입력으로 저장 */
  force?: boolean;
  /** 마감된 주처럼 덮어쓸 수 없는 충돌 */
  locked?: boolean;
  attempts: number;
};

export const KIND_LABEL: Record<Kind, string> = { income: "수입", expense: "지출" };

/** fetch 가 끊겨서 난 오류인지 (서버가 거절한 것과 구분) */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|ERR_INTERNET_DISCONNECTED|ECONNREFUSED|ENOTFOUND|timed? ?out/i.test(msg);
}

export const isClosedWeekError = (e: unknown) => /마감된 주/.test(e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e ?? ""));

/** 같은 사용자·종류·주일의 대기 항목에 새 입력을 덧씌운다. 기준 서명(baseSig)은 처음 것을 지킨다 */
export function mergeQueued(existing: OutboxItem | undefined, incoming: Omit<OutboxItem, "id" | "queuedAt" | "updatedAt" | "status" | "attempts">, now = new Date().toISOString()): OutboxItem {
  if (!existing) return { ...incoming, queuedAt: now, updatedAt: now, status: "pending", attempts: 0 };
  return {
    ...existing, rows: incoming.rows, updatedAt: now, status: "pending", attempts: 0,
    reason: undefined, serverRows: undefined, locked: undefined,
    // 이미 충돌을 '내 입력으로' 풀기로 했다면 그 결정은 유지
    force: existing.force,
  };
}

export type Decision =
  | { action: "skip" }                       // 서버가 이미 같은 내용
  | { action: "save" }                       // 그대로 올린다
  | { action: "conflict"; reason: string };  // 사용자가 골라야 한다

/** 서버의 현재 서명을 보고 올릴지, 충돌로 둘지 정한다 */
export function decide(item: Pick<OutboxItem, "baseSig" | "force">, mineSig: string, serverSig: string, serverCount: number): Decision {
  if (serverSig === mineSig) return { action: "skip" };
  if (item.force) return { action: "save" };
  if (item.baseSig === null) return serverCount > 0 ? { action: "conflict", reason: "오프라인에서 입력하는 사이 서버에 이미 입력이 있었어요" } : { action: "save" };
  if (item.baseSig !== serverSig) return { action: "conflict", reason: "입력을 시작한 뒤 서버 내용이 다른 곳에서 바뀌었어요" };
  return { action: "save" };
}

export const summarize = (rows: { amount: number }[]) => ({ count: rows.length, total: rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) });

/** 읽기 캐시 키: 사용자별로 나눠서 같은 기기의 다른 계정 데이터가 보이지 않게 */
export const cacheKey = (uid: string, name: string) => `${uid}|${name}`;

/** 문자열 → 짧은 해시 (FNV-1a). 쿼리 함수 본문을 캐시 키로 쓰기 위해 */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** 수입·지출 입력 화면의 임시저장 키 (화면과 동기화 모듈이 같이 쓴다) */
export const DRAFT_KEYS: Record<Kind, { draft: string; meta: string; path: string }> = {
  income: { draft: "ndfms.income.draft", meta: "ndfms.income.draft.meta", path: "/income/entry" },
  expense: { draft: "ndfms.expense.draft", meta: "ndfms.expense.draft.meta", path: "/expense/entry" },
};
