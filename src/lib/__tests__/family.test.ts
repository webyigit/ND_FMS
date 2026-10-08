import { describe, expect, it } from "vitest";
import { coreName, defaultHead, familyCandidates, mergePlan, sumCandidates, type FamilyMember } from "../income/family";
import type { PersonTotal } from "../income/report";

// 가상 이름·금액 (실데이터 아님)
const pt = (key: string, name: string, total: number, householdId: number | null = null): PersonTotal => ({
  key, name, memberId: key.startsWith("m") ? Number(key.slice(1)) : null, householdId, householdLabel: householdId ? `가정${householdId}` : null,
  byType: { 1: total }, byMonth: Array(12).fill(0), total, n: 1, members: [name],
});
const mem = (id: number, full_name: string, household_id: number | null = null, is_household_head = false): FamilyMember =>
  ({ id, full_name, title: null, household_id, household_label: household_id ? `가정${household_id}` : null, is_household_head });

const members = [mem(1, "가나다"), mem(2, "가나다A"), mem(3, "가나다가정", 9, true), mem(4, "라마바", 9), mem(5, "사아자"), mem(6, "차카타")];
const persons = [pt("m1", "가나다", 100), pt("m2", "가나다A", 50), pt("m3", "가나다가정", 30, 9), pt("m4", "라마바", 20, 9), pt("m5", "사아자", 10), pt("l가나다,사아자", "가나다,사아자", 5)];

describe("가족단위", () => {
  it("이름 핵심", () => {
    expect(coreName("가나다 A")).toBe("가나다");
    expect(coreName("가나다,라마바")).toBe("가나다라마바");
  });
  it("기준 이름 포함 명단 + 같은 가족 + 직접 추가", () => {
    const list = familyCandidates(persons[0], persons, members, [6]);
    expect(list.map((c) => [c.key, c.why])).toEqual([
      ["m1", "기준"], ["l가나다,사아자", "이름 포함"], ["m3", "이름 포함"], ["m2", "이름 포함"], ["m4", "같은 가족"], ["m6", "직접 추가"],
    ]);
    expect(list.find((c) => c.key === "m6")).toMatchObject({ total: 0, memberId: 6 });
    expect(list.find((c) => c.key === "l가나다,사아자")).toMatchObject({ memberId: null, total: 5 });
    expect(sumCandidates(list)).toBe(205);
  });
  it("세대주 기본값: 기존 세대주 → 기준 → 첫 번째", () => {
    const list = familyCandidates(persons[0], persons, members);
    const pick = (...keys: string[]) => list.filter((c) => keys.includes(c.key));
    expect(defaultHead(pick("m1", "m3"), "m1")).toBe(3);
    expect(defaultHead(pick("m1", "m2"), "m1")).toBe(1);
    expect(defaultHead(pick("m2", "l가나다,사아자"), "m1")).toBe(2);
  });
  it("합치기 계획: 세대주 가족에 이미 있는 사람·미등록 표기는 빼고", () => {
    const list = familyCandidates(persons[0], persons, members);
    const pick = (...keys: string[]) => list.filter((c) => keys.includes(c.key));
    expect(mergePlan(pick("m1", "m2", "m3", "m4"), 3)).toEqual([1, 2]);
    expect(mergePlan(pick("m1", "m2", "l가나다,사아자"), 1)).toEqual([2]);
    expect(mergePlan(pick("m1", "m4"), 1)).toEqual([4]); // 다른 가족에서 옮겨 옴
    expect(mergePlan(pick("m1"), 99)).toEqual([]);
  });
});
