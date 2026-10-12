import { describe, expect, it } from "vitest";
import { incomeTotals, mergeExpense, mergeIncome } from "../mission/entry";
import { findMenu } from "../menu";
import type { ExpenseRow, IncomeEntry } from "../db/weekly";

const inc = (id: string, typeId: number, amount: number): IncomeEntry => ({ id, typeId, channel: "cash", memberId: null, name: "가상", amount, memo: "" });
const exp = (id: string, dept: string, item: string, amount: number): ExpenseRow => ({ id, content: "", amount, dept, item, requester: "", memo: "", source: "직접" });
const SEP = [15, 16];

describe("해외선교 입력 합치기", () => {
  it("수입: 최신 DB의 일반·특별 행은 그대로, 해외선교 행은 화면 것으로", () => {
    const fresh = [inc("db-1", 1, 100), inc("db-2", 15, 30), inc("db-3", 2, 50)]; // 다른 화면이 db-3을 방금 넣음
    const mine = [inc("db-2", 15, 40), inc("new", 16, 10)];
    const out = mergeIncome(fresh, mine, SEP);
    expect(out.map((e) => [e.id, e.amount])).toEqual([["db-1", 100], ["db-3", 50], ["db-2", 40], ["new", 10]]);
  });
  it("수입: 화면에서 지운 해외선교 행은 빠지고, 화면에 섞인 일반 행은 무시", () => {
    const out = mergeIncome([inc("db-1", 1, 100), inc("db-2", 15, 30)], [inc("x", 1, 999)], SEP);
    expect(out.map((e) => e.id)).toEqual(["db-1"]);
  });
  it("지출: 해외선교 부서만 바꾼다", () => {
    const fresh = [exp("db-1", "예배", "꽃", 10), exp("db-2", "해외선교", "선교사 후원", 100)];
    const out = mergeExpense(fresh, [exp("db-2", "해외선교", "선교사 후원", 150), exp("n", "해외선교", "네팔 구호", 50)]);
    expect(out.map((r) => [r.id, r.amount])).toEqual([["db-1", 10], ["db-2", 150], ["n", 50]]);
  });
  it("헌금구분별 합계", () => {
    expect(incomeTotals([inc("a", 15, 10), inc("b", 15, 5), inc("c", 16, 7)], [{ id: 15, name: "해외선교" }, { id: 16, name: "네팔선교" }]))
      .toEqual([{ id: 15, name: "해외선교", count: 2, total: 15 }, { id: 16, name: "네팔선교", count: 1, total: 7 }]);
  });
  it("메뉴: /mission/entry 는 해외선교 입력, /mission 은 현황", () => {
    expect(findMenu("/mission/entry")?.item.label).toBe("해외선교 입력");
    expect(findMenu("/mission")?.item.label).toBe("해외선교 현황");
  });
});
