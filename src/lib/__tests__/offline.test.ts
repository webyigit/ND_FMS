import { describe, expect, it } from "vitest";
import { DRAFT_KEYS, cacheKey, decide, hash, isClosedWeekError, isNetworkError, mergeQueued, summarize, type OutboxItem } from "../offline/logic";
import { incomeSig, type IncomeEntry } from "../db/weekly";

const row = (amount: number, name = "가나다"): IncomeEntry => ({ id: "x", typeId: 1, channel: "cash", memberId: null, name, amount, memo: "" });
const base = (over: Partial<OutboxItem> = {}): OutboxItem => ({ uid: "u1", kind: "income", sunday: "2026-10-04", rows: [row(1000)], baseSig: "A", queuedAt: "t0", updatedAt: "t0", status: "pending", attempts: 0, ...over });

describe("오프라인 동기화 판단", () => {
  it("서버가 이미 같은 내용이면 건너뛴다", () => {
    expect(decide(base(), "M", "M", 1)).toEqual({ action: "skip" });
  });
  it("입력 시작 때 서버 내용과 같으면 그대로 올린다", () => {
    expect(decide(base({ baseSig: "A" }), "M", "A", 1)).toEqual({ action: "save" });
  });
  it("그 사이 서버가 바뀌었으면 덮어쓰지 않고 충돌", () => {
    const d = decide(base({ baseSig: "A" }), "M", "B", 2);
    expect(d.action).toBe("conflict");
  });
  it("서버 내용을 한 번도 못 받았을 때: 서버가 비어 있으면 올리고, 있으면 충돌", () => {
    expect(decide(base({ baseSig: null }), "M", incomeSig([]), 0)).toEqual({ action: "save" });
    expect(decide(base({ baseSig: null }), "M", "S", 3).action).toBe("conflict");
  });
  it("사용자가 '내 입력으로' 고르면(force) 서버가 달라도 올린다", () => {
    expect(decide(base({ baseSig: "A", force: true }), "M", "B", 2)).toEqual({ action: "save" });
  });
});

describe("대기열 합치기", () => {
  it("처음 넣으면 pending 새 항목", () => {
    const it_ = mergeQueued(undefined, { uid: "u1", kind: "expense", sunday: "2026-10-04", rows: [], baseSig: "A" }, "t1");
    expect(it_).toMatchObject({ status: "pending", attempts: 0, queuedAt: "t1", updatedAt: "t1", baseSig: "A" });
  });
  it("같은 주일을 다시 저장하면 행만 바꾸고 기준 서명·처음 시각은 지킨다", () => {
    const prev = base({ id: 3, baseSig: "A", status: "conflict", reason: "r", serverRows: [row(5)], attempts: 2 });
    const next = mergeQueued(prev, { uid: "u1", kind: "income", sunday: "2026-10-04", rows: [row(2000)], baseSig: "Z" }, "t9");
    expect(next).toMatchObject({ id: 3, baseSig: "A", queuedAt: "t0", updatedAt: "t9", status: "pending", attempts: 0 });
    expect(next.rows).toEqual([row(2000)]);
    expect(next.reason).toBeUndefined();
    expect(next.serverRows).toBeUndefined();
  });
  it("'내 입력으로' 결정(force)은 다시 저장해도 유지", () => {
    expect(mergeQueued(base({ force: true }), { uid: "u1", kind: "income", sunday: "2026-10-04", rows: [], baseSig: null }).force).toBe(true);
  });
});

describe("오류 구분", () => {
  it("네트워크 끊김과 서버 거절을 구분", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError({ message: "TypeError: NetworkError when attempting to fetch resource." })).toBe(true);
    expect(isNetworkError({ message: "Load failed" })).toBe(true);
    expect(isNetworkError({ message: "권한이 없습니다" })).toBe(false);
    expect(isNetworkError({ message: "마감된 주입니다: 2026-10-04" })).toBe(false);
  });
  it("마감된 주", () => {
    expect(isClosedWeekError({ message: "마감된 주입니다: 2026-10-04" })).toBe(true);
    expect(isClosedWeekError({ message: "부서·항목을 찾을 수 없습니다" })).toBe(false);
  });
});

describe("도우미", () => {
  it("요약·캐시 키·해시", () => {
    expect(summarize([row(1000), row(2500)])).toEqual({ count: 2, total: 3500 });
    expect(cacheKey("u1", "ref")).toBe("u1|ref");
    expect(hash("abc")).toBe(hash("abc"));
    expect(hash("abc")).not.toBe(hash("abd"));
    expect(DRAFT_KEYS.income.path).toBe("/income/entry");
  });
});
