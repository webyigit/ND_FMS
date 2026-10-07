// 은행 '거래기록사항'에서 헌금자와 헌금구분을 추정한다. 결과는 제안값이며 화면에서 수정 가능.
// 예: "홍길동십일조", "홍길동김영희네팔", "주일헌금"(현금, 이름 없음)
// 순서: 1) 과거 이력(같은 적요) 2) 적요 끝(없으면 앞)의 헌금 키워드 3) 교인 이름·별칭(가족 묶음은 이어 붙인 이름)

export type OfferingKeyword = { offeringTypeId: number; keywords: string[] };
export type MemberRef = { id: number; name: string; aliases?: string[] };
export type HistoryHit = { description: string; offeringTypeId: number; memberId: number | null };

export const DEFAULT_KEYWORDS: Record<string, string[]> = {
  십일조: ["십일조", "십일"],
  주일헌금: ["주일헌금", "주일"],
  범사감사: ["범사"],
  기타감사: ["기타감사", "감사"],
  일천번제: ["일천번제", "일천"],
  신년감사: ["신년"],
  부활절: ["부활"],
  맥추감사절: ["맥추"],
  추수감사절: ["추수"],
  성탄절: ["성탄"],
  이웃사랑: ["이웃사랑", "이웃"],
  꽃꽂이: ["꽃꽂이", "꽃"],
  건축: ["건축", "EV", "E/V"],
  해외선교: ["해외선교", "선교"],
  네팔선교: ["네팔"],
};

/** 헌금구분 목록 → 키워드(기본 키워드 + 헌금구분 이름) */
export const keywordsFor = (types: { id: number; name: string }[]): OfferingKeyword[] =>
  types.map((t) => ({ offeringTypeId: t.id, keywords: [...new Set([t.name, ...(DEFAULT_KEYWORDS[t.name] ?? [])])] }));

export type Classification = {
  offeringTypeId: number | null;
  memberIds: number[];
  rest: string; // 매칭 못한 나머지 문자열
  source: "history" | "keyword" | "none";
};

/** 비교용: 공백·괄호·구두점 제거 */
export const normDesc = (s: string) => s.replace(/[\s()[\]{}·.,_\-]/g, "");

export function classifyDeposit(
  description: string,
  keywords: OfferingKeyword[],
  members: MemberRef[],
  history: HistoryHit[] = [],
): Classification {
  const text = normDesc(description);
  // 1) 과거에 같은 적요로 입력한 이력이 있으면 그대로 따른다
  const past = text ? history.find((h) => normDesc(h.description) === text) : undefined;
  if (past) {
    return { offeringTypeId: past.offeringTypeId, memberIds: past.memberId ? [past.memberId] : [], rest: "", source: "history" };
  }
  // 2) 끝에 붙은 헌금 키워드(긴 것 우선). 끝에 없으면 앞에 붙은 것
  let offeringTypeId: number | null = null;
  let rest = text;
  const flat = keywords
    .flatMap((k) => k.keywords.map((w) => ({ id: k.offeringTypeId, w: normDesc(w) })))
    .filter((k) => k.w)
    .sort((a, b) => b.w.length - a.w.length);
  const end = flat.find(({ w }) => rest.endsWith(w));
  const start = end ? undefined : flat.find(({ w }) => rest.startsWith(w));
  if (end) { offeringTypeId = end.id; rest = rest.slice(0, -end.w.length); }
  else if (start) { offeringTypeId = start.id; rest = rest.slice(start.w.length); }
  // 3) 남은 문자열을 교인 이름·별칭으로 앞에서부터 잘라 매칭(가족 묶음 지원)
  const names = members
    .flatMap((m) => [m.name, ...(m.aliases ?? [])].map((n) => ({ id: m.id, n: normDesc(n) })))
    .filter((x) => x.n)
    .sort((a, b) => b.n.length - a.n.length);
  const memberIds: number[] = [];
  let guard = 0;
  while (rest && guard++ < 10) {
    const hit = names.find(({ n }) => rest.startsWith(n));
    if (!hit) break;
    if (!memberIds.includes(hit.id)) memberIds.push(hit.id);
    rest = rest.slice(hit.n.length);
  }
  return { offeringTypeId, memberIds, rest, source: offeringTypeId || memberIds.length ? "keyword" : "none" };
}
