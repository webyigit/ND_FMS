import { describe, expect, it } from "vitest";
import { fromFundRows, groupOfferings, lineOf, separateLines, weekSummary } from "../expense/report";
import { byDepartment, periodRange } from "../expense/budget";
import { amountMatch, filterHistory, monthlyTotals, type HistRow } from "../expense/history";
import { clergyByPerson } from "../expense/clergy";
import { fixedProblems, emptyFixed, sortFixed, toFixedRow } from "../expense/fixed";
import { addDays, isSunday, sundayOf } from "../expense/week";
import { fromReconRow, reconcile, verdict } from "../reconcile";

// 테스트 데이터는 모두 가상(실명·실금액 아님)
describe("금주 리포트", () => {
  const funds = fromFundRows([
    { kind: "general", name: "일반", carry: "1000000", prev_net: 60000, week_in: 200000, week_out: 10000, week_transfer: -5000, balance: "1245000" },
    { kind: "special", name: "특별", carry: 500000, prev_net: 50000, week_in: 0, week_out: 0, week_transfer: 5000, balance: 555000 },
    { kind: "separate", name: "별도", carry: 300000, prev_net: 30000, week_in: 0, week_out: 20000, week_transfer: 0, balance: 310000 },
  ]);
  it("일반·특별 A/B/C/잔액, 합계는 별도 기금 제외", () => {
    const { lines, total } = weekSummary(funds);
    expect(lines[0]).toEqual({ label: "일반회계", prev: 1060000, income: 200000, expense: 10000, transfer: -5000, balance: 1245000 });
    expect(lines[1].balance).toBe(555000);
    expect(total).toMatchObject({ prev: 1610000, income: 200000, expense: 10000, transfer: 0, balance: 1800000 });
    // 잔액 = A + B − C + 대체
    lines.forEach((l) => expect(l.prev + l.income - l.expense + l.transfer).toBe(l.balance));
  });
  it("별도 기금 줄 나누기", () => {
    const names = ["해외선교", "네팔선교"];
    expect(lineOf(names, "네팔 긴급구호 송금")).toBe("네팔선교");
    expect(lineOf(names, "선교사 후원")).toBe("해외선교");
    const rows = separateLines(names,
      [{ name: "해외선교", amount: 30000, thisWeek: false }, { name: "네팔선교", amount: 10000, thisWeek: true }],
      [{ text: "네팔선교후원", amount: 20000, thisWeek: true }]);
    expect(rows).toEqual([
      { name: "해외선교", weekIn: 0, weekOut: 0, yearIn: 30000, yearOut: 0 },
      { name: "네팔선교", weekIn: 10000, weekOut: 20000, yearIn: 10000, yearOut: 20000 },
    ]);
  });
  it("특별헌금 묶음", () => {
    const g = groupOfferings([{ type: "이웃사랑", name: "가나다", amount: 1000 }, { type: "건축", name: "라마바", amount: 3000 }, { type: "이웃사랑", name: "사아자", amount: 2000 }]);
    expect(g.map((x) => [x.type, x.rows.length, x.total])).toEqual([["이웃사랑", 2, 3000], ["건축", 1, 3000]]);
  });
});

describe("검증시트", () => {
  it("C=A+B, E=C−D, G=E−F, G−H 판정", () => {
    const r = reconcile(fromReconRow({ bank_balance: "2110000", pending_deposit: 0, mission_unremitted: 310000, ledger_balance: 1800000, base_surplus: null }));
    expect(r).toEqual({ realBalance: 2110000, accountBalance: 1800000, available: 0, diff: 0, ok: true });
    expect(verdict(0).label).toBe("일치");
    expect(verdict(-500)).toEqual({ label: "부족", amount: 500 });
    expect(verdict(700)).toEqual({ label: "초과", amount: 700 });
  });
});

describe("부서별 지출", () => {
  const items = [
    { itemId: 2, dept: "음악부", deptOrder: 10, item: "찬양대", itemOrder: 1, budget: 100000 },
    { itemId: 1, dept: "관리부", deptOrder: 7, item: "공공요금", itemOrder: 1, budget: 200000 },
    { itemId: 3, dept: "관리부", deptOrder: 7, item: "수선비", itemOrder: 2, budget: 0 },
  ];
  const txs = [
    { itemId: 1, sunday: "2026-03-01", content: "전기", amount: 50000, requester: "", memo: "" },
    { itemId: 1, sunday: "2026-08-02", content: "수도", amount: 30000, requester: "", memo: "" },
    { itemId: 2, sunday: "2026-02-01", content: "악보", amount: 120000, requester: "가나다", memo: "" },
  ];
  it("부서 순서, 기간, 잔액·집행률, 빈 항목 제외", () => {
    const { depts, total } = byDepartment(items, txs, "2026-01-01", "2026-06-30");
    expect(depts.map((d) => d.dept)).toEqual(["관리부", "음악부"]);
    expect(depts[0].items.map((i) => i.item)).toEqual(["공공요금"]);
    expect(depts[0]).toMatchObject({ budget: 200000, spent: 50000, remain: 150000, rate: "25.00%" });
    expect(depts[1].items[0]).toMatchObject({ remain: -20000, rate: "120.00%" });
    expect(total).toMatchObject({ budget: 300000, spent: 170000 });
  });
  it("기간 단축", () => {
    expect(periodRange(2026, "Y")).toEqual(["2026-01-01", "2026-12-31"]);
    expect(periodRange(2026, "H1")).toEqual(["2026-01-01", "2026-06-30"]);
    expect(periodRange(2026, "Q3")).toEqual(["2026-07-01", "2026-09-30"]);
    expect(periodRange(2028, "M2")).toEqual(["2028-02-01", "2028-02-29"]);
  });
});

describe("과거 지출내역", () => {
  const rows: HistRow[] = [
    { id: 1, sunday: "2025-01-05", month: 1, department: "관리부", item: "공공요금", content: "전기요금", amount: 50000, requester: "가나다", memo: "1월분" },
    { id: 2, sunday: "2025-01-12", month: 1, department: "음악부", item: "찬양대", content: "악보", amount: 12000, requester: "라마바", memo: "" },
    { id: 3, sunday: "2025-02-02", month: 2, department: "관리부", item: "공공요금", content: "수도요금", amount: 30000, requester: "가나다", memo: "" },
  ];
  it("금액 검색", () => {
    expect(amountMatch(50000, "50,000")).toBe(true);
    expect(amountMatch(50000, "10000~40000")).toBe(false);
    expect(amountMatch(30000, "~30000")).toBe(true);
    expect(amountMatch(1, "")).toBe(true);
  });
  it("이름·내용·비고 검색과 월별 합계", () => {
    expect(filterHistory(rows, { name: "가나" }).map((r) => r.id)).toEqual([1, 3]);
    expect(filterHistory(rows, { content: "공공" }).map((r) => r.id)).toEqual([1, 3]);
    expect(filterHistory(rows, { memo: "1월" }).map((r) => r.id)).toEqual([1]);
    expect(monthlyTotals(rows)).toEqual([{ month: 1, count: 2, total: 62000 }, { month: 2, count: 1, total: 30000 }]);
  });
});

describe("교역자급여·고정지출·주일", () => {
  it("직분 순서로 묶는다", () => {
    const p = clergyByPerson([
      { year: 2026, month: 1, name: "다부목", title: "부목사", item: "사례비", amount: 10, paidAt: "" },
      { year: 2026, month: 1, name: "나담임", title: "담임목사", item: "사례비", amount: 20, paidAt: "" },
      { year: 2026, month: 2, name: "나담임", title: "담임목사", item: "목양비", amount: 5, paidAt: "" },
    ], ["원로목사", "담임목사", "부목사", "전도사"]);
    expect(p.map((x) => x.name)).toEqual(["나담임", "다부목"]);
    expect(p[0].byMonth[1] + p[0].byMonth[2]).toBe(25);
  });
  it("교역자급여: 등록 순서대로, 지급 없는 교역자도 0으로, 같은 이름 여러 항목은 합침", () => {
    const p = clergyByPerson([
      { year: 2026, month: 3, name: "가부목", title: "부목사", item: "사례비", amount: 10, paidAt: "", order: 3 },
      { year: 2026, month: 3, name: "가부목", title: "부목사", item: "연금", amount: 2, paidAt: "", order: 7 },
      { year: 2026, month: 3, name: "중고등부 전도사", title: "전도사", item: "사례비", amount: 5, paidAt: "", order: 5 },
    ], ["원로목사", "담임목사", "부목사", "전도사"], [{ name: "나원로", title: "원로목사", order: 1 }, { name: "가부목", title: "부목사", order: 3 }]);
    expect(p.map((x) => x.name)).toEqual(["나원로", "가부목", "중고등부 전도사"]);
    expect(p[0].byMonth.reduce((a, b) => a + b, 0)).toBe(0);
    expect(p[1].byMonth[3]).toBe(12);
  });
  it("고정지출 확인·정렬·DB 행", () => {
    expect(fixedProblems(emptyFixed())).toEqual(["내용", "금액", "부서·항목"]);
    expect(fixedProblems({ ...emptyFixed(), weekOfMonth: 6, content: "x", amount: 1, expenseItemId: 1 })).toEqual(["N째 주(1~5)"]);
    const s = sortFixed([{ weekOfMonth: 2, active: true, content: "나" }, { weekOfMonth: 1, active: false, content: "가" }, { weekOfMonth: 1, active: true, content: "다" }]);
    expect(s.map((x) => x.content)).toEqual(["다", "가", "나"]);
    expect(toFixedRow({ ...emptyFixed(), content: " 전기 ", amount: 1, expenseItemId: 3 })).toMatchObject({ content: "전기", memo: null, week_of_month: 1 });
  });
  it("주일 계산", () => {
    expect(isSunday("2026-10-04")).toBe(true);
    expect(isSunday("2026-10-05")).toBe(false);
    expect(sundayOf("2026-10-07")).toBe("2026-10-04");
    expect(addDays("2026-01-04", -7)).toBe("2025-12-28");
  });
});
