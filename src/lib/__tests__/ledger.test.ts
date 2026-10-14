import { describe, expect, it } from "vitest";
import { groupOfType, ledger, specialLineOf, type LedgerInput } from "../ledger/general";

const base: LedgerInput = {
  year: 2026, sunday: "2026-10-11",
  types: [
    { id: 3, name: "십일조", parentId: null, order: 1, fund: "일반" }, { id: 1, name: "주일헌금", parentId: null, order: 2, fund: "일반" },
    { id: 4, name: "감사헌금", parentId: null, order: 3, fund: "일반" }, { id: 6, name: "범사감사", parentId: 4, order: 4, fund: "일반" }, { id: 5, name: "기타감사", parentId: 4, order: 5, fund: "일반" },
    { id: 7, name: "부활절", parentId: null, order: 6, fund: "일반" }, { id: 8, name: "신년감사", parentId: null, order: 7, fund: "일반" },
    { id: 13, name: "이웃사랑", parentId: null, order: 10, fund: "특별" }, { id: 14, name: "건축(E/V)헌금", parentId: null, order: 11, fund: "특별" },
    { id: 15, name: "해외선교", parentId: null, order: 20, fund: "별도" },
  ],
  items: [
    { id: 101, dept: "예배부", deptOrder: 1, item: "성찬", fund: "일반" }, { id: 102, dept: "관리부", deptOrder: 2, item: "공공요금", fund: "일반" },
    { id: 103, dept: "이웃사랑선교부", deptOrder: 3, item: "이웃사랑 구제", fund: "특별" }, { id: 104, dept: "재정부", deptOrder: 4, item: "건축적립", fund: "특별" },
    { id: 105, dept: "재정부", deptOrder: 4, item: "특별 기타", fund: "특별" },
    { id: 106, dept: "해외선교", deptOrder: 13, item: "선교사 후원", fund: "별도" },
  ],
  budgets: [{ offeringTypeId: 3, expenseItemId: null, amount: 1000 }, { offeringTypeId: 5, expenseItemId: null, amount: 500 }, { offeringTypeId: null, expenseItemId: 101, amount: 300 }, { offeringTypeId: null, expenseItemId: 102, amount: 700 }],
  carry: { 일반: -100, 특별: 400, 별도: 50 },
  typeCarry: new Map([[13, 300], [14, 100]]),
  income: [{ offeringTypeId: 3, amount: 800 }, { offeringTypeId: 6, amount: 60 }, { offeringTypeId: 5, amount: 40 }, { offeringTypeId: 13, amount: 70 }, { offeringTypeId: 15, amount: 30 }],
  expense: [{ expenseItemId: 101, amount: 100, fee: 1 }, { expenseItemId: 103, amount: 20, fee: 0 }, { expenseItemId: 104, amount: 5, fee: 0 }, { expenseItemId: 105, amount: 2, fee: 0 }, { expenseItemId: 106, amount: 10, fee: 0 }],
  transfers: [{ from: "일반", to: "특별", amount: 7 }],
  loans: [{ lender: "수협은행", principal: 100 }, { lender: "해외선교헌금", principal: 40 }],
};

describe("총계원장", () => {
  it("요약: 이월+헌금−지출±대체 = 잔액", () => {
    const l = ledger(base);
    expect(l.summary.rows[0]).toEqual({ label: "일반헌금", budget: 1500, carry: -100, income: 900, total: 800, expense: 101, transfer: -7, balance: 692 });
    expect(l.summary.rows[1]).toEqual({ label: "특별헌금", budget: 0, carry: 400, income: 70, total: 470, expense: 27, transfer: 7, balance: 450 });
    expect(l.summary.total).toMatchObject({ label: "총계", budget: 1500, carry: 300, income: 970, expense: 128, balance: 1142 });
  });
  it("일반헌금: 하위 구분은 상위로 합치고 묶음 순서(일반→절기→기타), 예산·실적 없는 구분은 뺀다", () => {
    const { income, expense } = ledger(base).general;
    expect(income.rows.map((r) => [r.group, r.name, r.budget, r.actual])).toEqual([["일반헌금", "십일조", 1000, 800], ["일반헌금", "감사헌금", 500, 100]]);
    expect(income.rows[0].rate).toBe(80);
    expect(income.total).toMatchObject({ budget: 1500, actual: 900, rate: 60 });
    expect(expense.rows.map((r) => [r.name, r.budget, r.actual])).toEqual([["예배부", 300, 101], ["관리부", 700, 0], ["이웃사랑선교부", 0, 20], ["재정부", 0, 7]]);
    expect(expense.rows[1].rate).toBe(0);
  });
  it("수수료 제외 옵션", () => {
    expect(ledger({ ...base, withFee: false }).summary.rows[0].expense).toBe(100);
  });
  it("특별헌금: 구분별 이월·수입·지출·잔액, 못 찾는 지출은 기타", () => {
    const { rows, total } = ledger(base).special;
    expect(rows.map((r) => [r.name, r.carry, r.income, r.expense, r.balance])).toEqual([
      ["이웃사랑", 300, 70, 20, 350], ["건축(E/V)헌금", 100, 0, 5, 95], ["기타(구분 못 찾음)", 0, 0, 2, -2],
    ]);
    expect(total).toEqual({ name: "합 계", carry: 400, income: 70, expense: 27, balance: 443 });
  });
  it("차입·별도 기금", () => {
    const l = ledger(base);
    expect(l.loans.total).toBe(140);
    expect(l.separate).toMatchObject({ carry: 50, income: 30, expense: 10, balance: 70 });
  });
  it("묶음·구분 줄 찾기", () => {
    expect(["십일조", "부활절", "맥추감사절", "신년감사", "기관헌금"].map(groupOfType)).toEqual(["일반헌금", "절기헌금", "절기헌금", "기타헌금", "기타헌금"]);
    expect(specialLineOf(["이웃사랑", "꽃꽂이", "건축(E/V)헌금"], "재정부 건축적립")).toBe("건축(E/V)헌금");
    expect(specialLineOf(["이웃사랑"], "음악부 찬양대")).toBeNull();
  });
});
