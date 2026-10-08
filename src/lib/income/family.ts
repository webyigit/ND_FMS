// 개인별 헌금현황 > 가족단위: 한 사람 이름을 포함한 헌금명단을 모으고, 고른 사람들을 한 가족(household)으로 합친다.
// 원본 수입 기록은 바꾸지 않는다. 가족은 교인(member)의 household 로만 묶고, 기부금영수증은 가족 합계로 발행한다.
import type { PersonTotal } from "./report";

/** 가족 판단에 쓰는 교인 정보 (v_member 일부) */
export type FamilyMember = {
  id: number; full_name: string; title: string | null; household_id: number | null; household_label: string | null; is_household_head: boolean;
};

/** 이름 핵심: 공백·영문·숫자 표기(동명이인 구분 A/B 등)를 뺀 한글 */
export const coreName = (s: string) => s.replace(/[^가-힣]/g, "");

export type Candidate = {
  key: string; memberId: number | null; name: string; title: string | null;
  householdId: number | null; householdLabel: string | null; isHead: boolean;
  total: number; byType: Record<number, number>; why: "기준" | "이름 포함" | "같은 가족" | "직접 추가";
};

/**
 * 가족단위 목록: 기준 1명 + 그 이름을 포함한 헌금명단(중복·가정 표기 등) + 지금 같은 가족 + 직접 추가한 사람.
 * persons 는 개인별 합계(해당 연도), members 는 전체 교인.
 */
export function familyCandidates(base: PersonTotal, persons: PersonTotal[], members: FamilyMember[], extraIds: number[] = []): Candidate[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const totalOf = new Map(persons.map((p) => [p.key, p]));
  const core = coreName(base.name);
  const out = new Map<string, Candidate>();
  const put = (key: string, why: Candidate["why"]) => {
    if (out.has(key)) return;
    const p = totalOf.get(key);
    const id = key.startsWith("m") ? Number(key.slice(1)) : null;
    const m = id != null ? byId.get(id) : undefined;
    if (!p && !m) return;
    out.set(key, {
      key, memberId: id, name: m?.full_name ?? p?.name ?? "", title: m?.title ?? null,
      householdId: m ? m.household_id : p?.householdId ?? null, householdLabel: m ? m.household_label : p?.householdLabel ?? null,
      isHead: !!m?.is_household_head, total: p?.total ?? 0, byType: p?.byType ?? {}, why,
    });
  };
  put(base.key, "기준");
  if (core.length >= 2) {
    persons.filter((p) => coreName(p.name).includes(core)).forEach((p) => put(p.key, "이름 포함"));
    members.filter((m) => coreName(m.full_name).includes(core)).forEach((m) => put(`m${m.id}`, "이름 포함"));
  }
  // 지금 가족으로 묶인 사람(기준·이름 포함인 사람들의 가족 모두)
  const hids = new Set([...out.values()].map((c) => c.householdId).filter((h): h is number => h != null));
  members.filter((m) => m.household_id != null && hids.has(m.household_id)).forEach((m) => put(`m${m.id}`, "같은 가족"));
  extraIds.forEach((id) => put(`m${id}`, "직접 추가"));
  const order = { 기준: 0, "이름 포함": 1, "같은 가족": 2, "직접 추가": 3 };
  return [...out.values()].sort((a, b) => order[a.why] - order[b.why] || a.name.localeCompare(b.name, "ko"));
}

/** 세대주 기본값: 고른 사람 중 이미 세대주인 사람 → 기준 → 첫 번째 */
export function defaultHead(selected: Candidate[], baseKey: string): number | null {
  const ms = selected.filter((c) => c.memberId != null);
  return (ms.find((c) => c.isHead) ?? ms.find((c) => c.key === baseKey) ?? ms[0])?.memberId ?? null;
}

/**
 * 합치기 계획: 세대주 가족에 들어가야 할 교인 id. 이미 세대주와 같은 가족이면 뺀다.
 * join_family(p_member, p_with=세대주)를 차례로 부르면 된다(세대주에게 가족이 없으면 첫 호출이 새로 만든다).
 */
export function mergePlan(selected: Candidate[], headId: number): number[] {
  const head = selected.find((c) => c.memberId === headId);
  if (!head) return [];
  return selected.filter((c) => c.memberId != null && c.memberId !== headId && (head.householdId == null || c.householdId !== head.householdId)).map((c) => c.memberId!);
}

/** 고른 사람들 합계 */
export const sumCandidates = (cs: Candidate[]) => cs.reduce((s, c) => s + c.total, 0);
