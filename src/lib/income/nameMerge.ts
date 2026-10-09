// 개인별 헌금현황 > 이름합치기: 오기입으로 따로 등록된 같은 사람을 찾아 대표 이름 하나로 합친다.
// 합치면 member.merged_into 만 바뀌고 수입 원본은 그대로다(되돌리기 가능). 가족 합치기(다른 사람끼리)와 다르다.
import { coreName } from "./family";

/** 이름합치기에 쓰는 교인 정보 (v_member + v_member_income_stat) */
export type MergeMember = {
  id: number; full_name: string; name_suffix: string | null; title: string | null; household_id: number | null; household_label: string | null;
  is_group: boolean | null; is_anonymous: boolean | null;
  n: number; total: number; first_sunday: string | null; last_sunday: string | null;
};

const BASE = 0xac00, LAST = 0xd7a3;

/** 한글 한 글자 → [초성, 중성, 종성] 번호. 한글이 아니면 null */
export function jamo(ch: string): [number, number, number] | null {
  const c = ch.charCodeAt(0);
  if (c < BASE || c > LAST) return null;
  const i = c - BASE;
  return [Math.floor(i / 588), Math.floor((i % 588) / 28), i % 28];
}

/** 두 글자의 자모 차이 수(0~3) */
export function jamoDiff(a: string, b: string): number {
  const x = jamo(a), y = jamo(b);
  if (!x || !y) return a === b ? 0 : 3;
  return (x[0] !== y[0] ? 1 : 0) + (x[1] !== y[1] ? 1 : 0) + (x[2] !== y[2] ? 1 : 0);
}

export type Similar = { kind: "글자 바뀜" | "글자 빠짐"; pos: number; jamo: number; why: string };

const PART = ["초성", "중성", "종성"];
function diffParts(a: string, b: string) {
  const x = jamo(a), y = jamo(b);
  if (!x || !y) return "";
  return [0, 1, 2].filter((i) => x[i] !== y[i]).map((i) => PART[i]).join("·");
}

/**
 * 오기입으로 볼 만한 두 이름인지. 이름 핵심(한글만)을 글자 단위로 비교한다.
 * - 3글자 이상 같은 길이에서 한 글자만 다르고, 그 글자의 자모가 1~2개만 다를 때 (홍길동 ↔ 홍길둥)
 * - 한 글자 빠짐 (3글자 이상 ↔ 한 글자 적음)
 * 같은 이름(동명이인 A/B 표기)은 일부러 나눈 것이라 후보로 보지 않는다.
 */
export function similar(a: string, b: string): Similar | null {
  const x = [...coreName(a)], y = [...coreName(b)];
  if (x.join("") === y.join("") || Math.min(x.length, y.length) < 2) return null;
  if (x.length === y.length) {
    if (x.length < 3) return null;
    const diff = x.map((c, i) => (c !== y[i] ? i : -1)).filter((i) => i >= 0);
    if (diff.length !== 1) return null;
    const p = diff[0], j = jamoDiff(x[p], y[p]);
    if (j > 2) return null;
    return { kind: "글자 바뀜", pos: p, jamo: j, why: `${p + 1}번째 글자 ${x[p]}↔${y[p]} (${diffParts(x[p], y[p])})` };
  }
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  if (l.length - s.length !== 1 || l.length < 3) return null;
  for (let i = 0; i < l.length; i++) {
    if ([...l.slice(0, i), ...l.slice(i + 1)].join("") === s.join("")) return { kind: "글자 빠짐", pos: i, jamo: 3, why: `${i + 1}번째 글자 '${l[i]}' 있고 없음` };
  }
  return null;
}

export type Pair = { a: number; b: number; sim: Similar };
export type Group = { members: MergeMember[]; pairs: Pair[]; into: number };

/** 대표 기본값: 헌금 건수가 가장 많은 사람 → 먼저 헌금한 사람 → id 작은 사람 */
export function defaultInto(ms: MergeMember[]): number | null {
  const s = [...ms].sort((p, q) => q.n - p.n || (p.first_sunday ?? "9").localeCompare(q.first_sunday ?? "9") || p.id - q.id);
  return s[0]?.id ?? null;
}

export const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * 비슷한 이름 후보 묶음. 헌금 기록이 있는 교인끼리만 본다(단체·무명·동명이인 표기 제외).
 * notSame 은 "다른 사람이에요"로 뺀 쌍(pairKey). 이어진 쌍은 한 묶음으로 모은다.
 */
export function suggestGroups(ms: MergeMember[], notSame: Set<string> = new Set()): Group[] {
  const pool = ms.filter((m) => m.n > 0 && !m.is_group && !m.is_anonymous && coreName(m.full_name).length >= 2);
  const pairs: Pair[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const p = pool[i], q = pool[j];
      if (notSame.has(pairKey(p.id, q.id))) continue;
      const sim = similar(p.full_name, q.full_name);
      if (sim) pairs.push({ a: p.id, b: q.id, sim });
    }
  }
  // 이어진 쌍 묶기 (union-find)
  const parent = new Map<number, number>();
  const find = (x: number): number => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  pairs.forEach((p) => parent.set(find(p.a), find(p.b)));
  const byRoot = new Map<number, Pair[]>();
  pairs.forEach((p) => { const r = find(p.a); byRoot.set(r, [...(byRoot.get(r) ?? []), p]); });
  const byId = new Map(pool.map((m) => [m.id, m]));
  const groups = [...byRoot.values()].map((ps): Group => {
    const ids = [...new Set(ps.flatMap((p) => [p.a, p.b]))];
    const members = ids.map((id) => byId.get(id)!).sort((p, q) => q.n - p.n || p.full_name.localeCompare(q.full_name, "ko"));
    return { members, pairs: ps, into: defaultInto(members)! };
  });
  // 오기입일 가능성이 큰 것(한쪽 건수가 적은 묶음, 자모 차이가 적은 묶음)부터
  const rank = (g: Group) => Math.min(...g.members.map((m) => m.n)) / Math.max(...g.members.map((m) => m.n)) + Math.min(...g.pairs.map((p) => p.sim.jamo)) / 10;
  return groups.sort((x, y) => rank(x) - rank(y) || x.members[0].full_name.localeCompare(y.members[0].full_name, "ko"));
}

/** 직접 합치기 검색: 이름 핵심이 들어가거나 비슷한 이름 */
export function searchMembers(ms: MergeMember[], q: string, exclude: Set<number> = new Set(), limit = 10): MergeMember[] {
  const k = coreName(q);
  if (!k) return [];
  const hit = ms.filter((m) => !exclude.has(m.id) && (coreName(m.full_name).includes(k) || (k.length >= 3 && similar(m.full_name, k))));
  return hit.sort((p, q2) => Number(!coreName(p.full_name).startsWith(k)) - Number(!coreName(q2.full_name).startsWith(k)) || q2.n - p.n).slice(0, limit);
}

/** 고른 사람 합계 */
export const sumMembers = (ms: MergeMember[]) => ({ n: ms.reduce((s, m) => s + m.n, 0), total: ms.reduce((s, m) => s + m.total, 0) });

/** 헌금 기간 표시: 2025-03 ~ 2025-04 */
export const period = (m: Pick<MergeMember, "first_sunday" | "last_sunday">) => {
  if (!m.first_sunday) return "";
  const f = m.first_sunday.slice(0, 7), l = (m.last_sunday ?? m.first_sunday).slice(0, 7);
  return f === l ? f : `${f} ~ ${l}`;
};
