import { describe, expect, it } from "vitest";
import type { Member } from "../demo";
import { addMember, frontRows, initOrder, moveMember, moveTitle, orderChanges, removeMember } from "../income/listOrder";
import { cleanTitles, DEFAULT_TITLE_ORDER, listRank } from "../offeringOrder";
import { parseTitleOrder, withListRank } from "../db/refData";

const T = ["원로목사", "담임목사", "시무장로"];
const MS: Member[] = [
  { id: 1, name: "가성도" },
  { id: 2, name: "나장로", title: "시무장로", rank: 5 },
  { id: 3, name: "다장로", title: "시무장로", rank: 4 },
  { id: 4, name: "라담임", title: "담임목사" },
  { id: 5, name: "마권사", title: "권사", rank: 9 },
  { id: 6, name: "바집사", title: "집사" },
];
const names = (s: ReturnType<typeof initOrder>) => frontRows(s, MS).map((r) => r.name);

describe("명단 정렬 순위", () => {
  it("직분 순서 → 교인 순서, 개별 지정은 그 뒤, 나머지 null", () => {
    expect(listRank({ title: "담임목사" }, T)).toBeLessThan(listRank({ title: "시무장로", rank: 1 }, T)!);
    expect(listRank({ title: "시무장로", rank: 1 }, T)).toBeLessThan(listRank({ title: "시무장로" }, T)!);
    expect(listRank({ title: "시무장로" }, T)).toBeLessThan(listRank({ title: "권사", rank: 1 }, T)!);
    expect(listRank({ title: "집사" }, T)).toBeNull();
    expect(listRank({}, T)).toBeNull();
  });
  it("요구사항 기본 순서·설정값 읽기·정리", () => {
    expect(DEFAULT_TITLE_ORDER).toEqual(["원로목사", "담임목사", "은퇴장로", "원로장로", "시무장로"]);
    expect(parseTitleOrder(["a"])).toEqual(["a"]);
    expect(parseTitleOrder(null)).toBe(DEFAULT_TITLE_ORDER);
    expect(parseTitleOrder([1])).toBe(DEFAULT_TITLE_ORDER);
    expect(cleanTitles([" 원로목사", "", "원로목사", "권사 "])).toEqual(["원로목사", "권사"]);
  });
  it("기준정보에 정렬 순위를 붙인다", () => {
    const xs = withListRank(MS, T);
    expect(xs.find((m) => m.id === 4)!.displayRank).toBe(listRank({ title: "담임목사" }, T));
    expect(xs.find((m) => m.id === 1)!.displayRank).toBeUndefined();
  });
});

describe("명단순서 편집", () => {
  it("처음: 지정 직분 묶음 → 개별 지정, 같은 직분은 교인 순서", () => {
    expect(names(initOrder(MS, T))).toEqual(["라담임", "다장로", "나장로", "마권사"]);
    expect(orderChanges(initOrder(MS, T), MS).map((c) => c.id)).toEqual([2, 3, 4, 5]); // 순서를 1,2,3… 으로 채움
  });
  it("같은 묶음 안에서만 위·아래", () => {
    let s = initOrder(MS, T);
    s = moveMember(s, MS, 2, -1);
    expect(names(s)).toEqual(["라담임", "나장로", "다장로", "마권사"]);
    expect(moveMember(s, MS, 2, -1)).toBe(s); // 다른 묶음(담임목사)과는 안 바뀜
    expect(moveMember(s, MS, 4, -1)).toBe(s);
  });
  it("직분 순서를 바꾸면 묶음 순서도", () => {
    const s = moveTitle(initOrder(MS, T), 2, -1);
    expect(s.titles).toEqual(["원로목사", "시무장로", "담임목사"]);
    expect(names(s)).toEqual(["다장로", "나장로", "라담임", "마권사"]);
    expect(moveTitle(s, 0, -1)).toBe(s);
  });
  it("추가: 직분을 주면 그 묶음 맨 뒤, 비우면 개별 지정", () => {
    let s = addMember(initOrder(MS, T), 1, "시무장로");
    expect(names(s)).toEqual(["라담임", "다장로", "나장로", "가성도", "마권사"]);
    s = addMember(s, 6, "");
    expect(names(s)).toEqual(["라담임", "다장로", "나장로", "가성도", "마권사", "바집사"]);
    const c = orderChanges(s, MS);
    expect(c.find((x) => x.id === 1)).toEqual({ id: 1, title: "시무장로", rank: 4 });
    expect(c.find((x) => x.id === 6)).toEqual({ id: 6, title: "", rank: 6 });
  });
  it("빼기: 지정 직분은 직분도 비우고, 개별 지정은 순서만 해제", () => {
    let s = removeMember(initOrder(MS, T), 3);
    s = removeMember(s, 5);
    expect(names(s)).toEqual(["라담임", "나장로"]);
    const c = orderChanges(s, MS);
    expect(c.find((x) => x.id === 3)).toEqual({ id: 3, title: "", rank: null });
    expect(c.find((x) => x.id === 5)).toEqual({ id: 5, title: "권사", rank: null });
  });
  it("저장 뒤 다시 열면 바뀐 것 없음", () => {
    const s = moveMember(initOrder(MS, T), MS, 2, -1);
    const saved = MS.map((m) => {
      const c = orderChanges(s, MS).find((x) => x.id === m.id);
      return c ? { ...m, title: c.title || undefined, rank: c.rank ?? undefined } : m;
    });
    expect(orderChanges(initOrder(saved, s.titles), saved)).toEqual([]);
    expect(names({ ...initOrder(saved, s.titles) })).toEqual(names(s));
  });
});
