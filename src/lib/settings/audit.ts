// 시스템 사용내역: 동작·대상 이름, 변경 전/후 비교 (순수 함수)

export const ACTIONS: Record<string, string> = {
  view: "화면 접속", insert: "추가", update: "수정", delete: "삭제", reveal: "계좌번호 보기", print: "출력", download: "내려받기",
};
export const TABLES: Record<string, string> = {
  ui: "화면", income: "수입", expense: "지출", app_user: "회원", member: "교인", household: "가족", member_alias: "교인 별칭",
  officer_roster: "재직명단", offering_type: "헌금구분", bank_account: "재정부 계좌", payee: "송금 계좌",
};
export const actionLabel = (a: string | null) => (a ? ACTIONS[a] ?? a : "-");
export const tableLabel = (t: string | null) => (t ? TABLES[t] ?? t : "-");

export type DiffLine = { key: string; before: string; after: string; changed: boolean };

// 암호문(bytea)·암호화 칸은 보여주지 않는다
const hidden = (k: string, v: unknown) => k.endsWith("_enc") || (typeof v === "string" && /^\\x[0-9a-f]+$/i.test(v));
const show = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** 변경 전/후를 칸별로 나란히. 바뀐 칸 먼저 */
export function diffRows(before: Record<string, unknown> | null, after: Record<string, unknown> | null): DiffLine[] {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys
    .filter((k) => !hidden(k, before?.[k]) && !hidden(k, after?.[k]))
    .map((k) => {
      const b = show(before?.[k]), a = show(after?.[k]);
      return { key: k, before: b, after: a, changed: !!before && !!after && b !== a };
    })
    .sort((x, y) => Number(y.changed) - Number(x.changed));
}

/** 암호화 칸이 바뀌었는지(값은 안 보이고 '바뀜'만 표시) */
export const secretChanged = (after: Record<string, unknown> | null) =>
  Object.entries(after ?? {}).filter(([k, v]) => k.endsWith("_enc") && v === "(새로 입력됨)").map(([k]) => k);

/** 기간 필터: to 날짜는 그날 끝까지 포함 (한국시간) */
export const dayRange = (from: string, to: string) => ({
  gte: from ? `${from}T00:00:00+09:00` : null,
  lt: to ? new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86400000).toISOString() : null,
});
