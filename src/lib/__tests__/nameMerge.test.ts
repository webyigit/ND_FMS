import { describe, expect, it } from "vitest";
import { defaultInto, jamoDiff, pairKey, period, searchMembers, similar, suggestGroups, sumMembers, type MergeMember } from "../income/nameMerge";

// 가상 이름·금액 (실데이터 아님)
const mm = (id: number, full_name: string, n: number, first = "2025-01-05", extra: Partial<MergeMember> = {}): MergeMember => ({
  id, full_name, name_suffix: null, title: null, household_id: null, household_label: null, is_group: false, is_anonymous: false,
  n, total: n * 10000, first_sunday: n ? first : null, last_sunday: n ? "2025-12-28" : null, ...extra,
});

describe("이름합치기: 비슷한 이름", () => {
  it("자모 차이", () => {
    expect(jamoDiff("훈", "춘")).toBe(1); // 초성
    expect(jamoDiff("훈", "운")).toBe(1);
    expect(jamoDiff("동", "둥")).toBe(1); // 중성
    expect(jamoDiff("가", "힣")).toBe(3);
  });
  it("한 글자 오기입은 후보, 동명이인 표기·전혀 다른 글자는 아님", () => {
    expect(similar("홍길동", "홍길둥")).toMatchObject({ kind: "글자 바뀜", pos: 2, jamo: 1 });
    expect(similar("홍길동", "홍길똥")?.why).toBe("3번째 글자 동↔똥 (초성)");
    expect(similar("홍길동", "홍길삼")).toBeNull();      // 자모 3개 다 다름
    expect(similar("홍길동", "홍길동A")).toBeNull();     // 동명이인 표기
    expect(similar("홍길동", "홍말둥")).toBeNull();      // 두 글자 다름
    expect(similar("가나", "가다")).toBeNull();          // 두 글자 이름은 바뀜 후보로 안 봄
    expect(similar("홍길동", "홍동")).toMatchObject({ kind: "글자 빠짐", pos: 1 });
    expect(similar("홍 길동", "홍길둥")).toMatchObject({ kind: "글자 바뀜" }); // 띄어쓰기 무시
  });
});

describe("이름합치기: 후보 묶음", () => {
  const ms = [
    mm(1, "홍길동", 40, "2024-01-07"), mm(2, "홍길둥", 2, "2025-03-02"), mm(3, "홍길똥", 1, "2025-04-06"),
    mm(4, "김가나", 30), mm(5, "김가니", 25), mm(6, "이다라", 10), mm(7, "이다러", 0),
    mm(8, "박마바", 3, "2025-01-05", { is_group: true }), mm(9, "박마버", 3),
  ];
  it("이어진 쌍은 한 묶음, 대표는 건수 많은 사람", () => {
    const gs = suggestGroups(ms);
    expect(gs.map((g) => g.members.map((m) => m.id))).toEqual([[1, 2, 3], [4, 5]]);
    expect(gs[0].into).toBe(1);
    expect(gs[0].pairs.length).toBe(3);
  });
  it("헌금 기록 없는 교인·단체는 빼고, '다른 사람'으로 뺀 쌍은 제외", () => {
    const gs = suggestGroups(ms, new Set([pairKey(5, 4)]));
    expect(gs.map((g) => g.members.map((m) => m.id))).toEqual([[1, 2, 3]]);
  });
  it("대표 기본값: 건수 → 먼저 헌금 → id", () => {
    expect(defaultInto([mm(3, "가", 2, "2025-02-01"), mm(2, "나", 2, "2025-01-01")])).toBe(2);
    expect(defaultInto([])).toBeNull();
  });
  it("직접 검색: 이름 포함 + 비슷한 이름, 이미 고른 사람 제외", () => {
    expect(searchMembers(ms, "홍길동").map((m) => m.id)).toEqual([1, 2, 3]);
    expect(searchMembers(ms, "홍길", new Set([1])).map((m) => m.id)).toEqual([2, 3]);
    expect(searchMembers(ms, " ")).toEqual([]);
  });
  it("합계·기간", () => {
    expect(sumMembers(ms.slice(0, 3))).toEqual({ n: 43, total: 430000 });
    expect(period(ms[0])).toBe("2024-01 ~ 2025-12");
    expect(period(ms[6])).toBe("");
  });
});
