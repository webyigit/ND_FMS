import { describe, expect, it } from "vitest";
import { addMonths, change, fundOf, lastYearSameDay, sundayOf, type ExpWeek, type IncWeek } from "../reports/common";
import { insights, monthlyOf, payeeAlerts, quarterlyOf, reportSunday, weekReport, weekReportText, weeklySeries, yearElapsed, ytdCompare, type PayeeActivity } from "../reports/dashboard";
import { isNepal, missionMonths, missionTxs, missionWeeks } from "../reports/mission";
import { copyPrevBudget, fundNext, planGroups, planLines, settleExpense, settleIncome, toBudgetPayload, type ItemRef, type OtRef } from "../reports/budget";
import { toBudgetItems, toExpenseTx, toIncomeBudgets, toIncomeTx } from "../reports/reportData";
import { spendingStatus } from "../officersReport";
import { expenseTable, incomeTable, auditPeriods } from "../auditReport";

// 가상 데이터 (실금액 아님)
const inc: IncWeek[] = [
  { sunday: "2026-09-27", type: "십일조", fund: "일반", amount: 1000 },
  { sunday: "2026-10-04", type: "십일조", fund: "일반", amount: 1500 },
  { sunday: "2026-10-04", type: "건축", fund: "특별", amount: 500 },
  { sunday: "2026-10-04", type: "해외선교", fund: "별도", amount: 300 },
  { sunday: "2026-10-04", type: "네팔선교", fund: "별도", amount: 100 },
  { sunday: "2025-10-05", type: "십일조", fund: "일반", amount: 1000 },
  { sunday: "2025-12-28", type: "십일조", fund: "일반", amount: 9000 },
];
const exp: ExpWeek[] = [
  { sunday: "2026-09-27", dept: "관리부", item: "공공요금", fund: "일반", amount: 800 },
  { sunday: "2026-10-04", dept: "관리부", item: "공공요금", fund: "일반", amount: 700 },
  { sunday: "2026-10-04", dept: "해외선교", item: "선교사 후원", fund: "별도", amount: 200 },
  { sunday: "2026-10-04", dept: "해외선교", item: "네팔 구호", fund: "별도", amount: 50 },
  { sunday: "2025-10-05", dept: "관리부", item: "공공요금", fund: "일반", amount: 300 },
];

describe("날짜 계산", () => {
  it("주일·월 이동·작년 같은 날", () => {
    expect(sundayOf("2026-10-07")).toBe("2026-10-04");
    expect(sundayOf("2026-10-04")).toBe("2026-10-04");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", -3)).toBe("2025-10-15");
    expect(lastYearSameDay("2028-02-29")).toBe("2027-02-28");
    expect(change(110, 100)).toBe("+10.0%");
    expect(change(90, 100)).toBe("−10.0%");
    expect(change(5, 0)).toBe("신규");
    expect(fundOf("separate")).toBe("별도");
    expect(fundOf(null)).toBe("일반");
  });
});

describe("대시보드", () => {
  it("금주 리포트: 기준 주일, 전주 대비, 잔액(이월 포함), 별도 기금은 따로", () => {
    const s = reportSunday(inc, exp, "2026-10-07");
    expect(s).toBe("2026-10-04");
    const w = weekReport(inc, exp, s, 10000);
    expect(w).toMatchObject({ income: 2000, expense: 700, prevIncome: 1000, prevExpense: 800, missionIncome: 400, missionExpense: 250 });
    expect(w.balance).toBe(10000 + 3000 - 1500); // 작년 것은 빼고
    const text = weekReportText(w);
    expect(text[0]).toContain("수입 2,000원");
    expect(text[0]).toContain("+100.0%");
    expect(text.at(-1)).toContain("해외선교");
    expect(reportSunday([], [], "2026-10-07")).toBe("2026-10-04");
  });
  it("주간·월·분기 추이", () => {
    const ws = weeklySeries(inc, exp, "2026-10-04", 3);
    expect(ws.map((w) => w.sunday)).toEqual(["2026-09-20", "2026-09-27", "2026-10-04"]);
    expect(ws[2]).toMatchObject({ income: 2000, expense: 700 });
    expect(monthlyOf(inc, exp, 2026)[9]).toMatchObject({ month: 10, income: 2000, expense: 700 });
    expect(quarterlyOf(inc, exp, 2025)[3]).toMatchObject({ quarter: 4, income: 10000, expense: 300 });
  });
  it("작년 같은 기간 비교는 오늘 날짜까지만", () => {
    const r = ytdCompare(inc, (x) => x.type, "2026-10-07");
    expect(r.find((x) => x.name === "십일조")).toMatchObject({ cur: 2500, prev: 1000 }); // 12/28 것은 제외
    expect(r.some((x) => x.name === "해외선교")).toBe(false);
  });
  it("송금 계좌 알림", () => {
    const ps: PayeeActivity[] = [
      { payeeId: 1, name: "가상상회", bank: null, account: null, first: "2026-10-04", last: "2026-10-04", cnt: 1, total: 100 },
      { payeeId: 2, name: "나다상사", bank: null, account: null, first: "2025-01-05", last: "2026-05-03", cnt: 5, total: 500 },
      { payeeId: 3, name: "라마전기", bank: null, account: null, first: "2025-01-05", last: "2026-08-02", cnt: 5, total: 500 },
    ];
    const a = payeeAlerts(ps, "2026-10-04", 3);
    expect(a.firstTime.map((p) => p.payeeId)).toEqual([1]);
    expect(a.dormant.map((p) => p.payeeId)).toEqual([2]);
    expect(payeeAlerts(ps, "2026-10-04", 12).dormant).toEqual([]);
  });
  it("인사이트는 규칙 문장 2~3줄", () => {
    const t = insights(inc, exp, "2026-10-07", { income: 0, expense: 10000 });
    expect(t.length).toBeGreaterThanOrEqual(2);
    expect(t.length).toBeLessThanOrEqual(3);
    expect(t[0]).toContain("늘었어요");
    expect(t.some((x) => x.includes("집행률 15.0%"))).toBe(true);
    expect(yearElapsed("2026-12-31")).toBeCloseTo(1);
    expect(insights([], [], "2026-10-07", { income: 0, expense: 0 })).toEqual([]);
  });
});

describe("해외선교", () => {
  it("주별 표: 네팔 별도 열, 잔액은 이월금부터", () => {
    expect(isNepal("네팔선교") && isNepal("네팔 구호") && !isNepal("해외선교")).toBe(true);
    const w = missionWeeks(inc, exp, 2026, 1000);
    expect(w).toEqual([{ sunday: "2026-10-04", month: 10, income: 300, nepalIncome: 100, expense: 200, nepalExpense: 50, balance: 1150 }]);
    const m = missionMonths(w, 1000);
    expect(m[0]).toMatchObject({ month: 1, cumIncome: 0, balance: 1000 });
    expect(m[11]).toMatchObject({ cumIncome: 400, cumExpense: 250, balance: 1150 });
  });
  it("보고서용 원장 거래", () => {
    const t = missionTxs(inc, [{ date: "2026-10-04", content: "가 선교사", amount: 200 }]);
    expect(t).toEqual([
      { date: "2026-10-04", content: "해외선교 헌금", income: 300, expense: 0 },
      { date: "2026-10-04", content: "네팔선교 헌금", income: 100, expense: 0 },
      { date: "2026-10-04", content: "가 선교사", income: 0, expense: 200 },
    ]);
  });
});

const types: OtRef[] = [
  { id: 15, name: "해외선교", fund: "별도", order: 15 },
  { id: 1, name: "십일조", fund: "일반", order: 1 },
  { id: 14, name: "건축", fund: "특별", order: 14 },
  { id: 2, name: "주일헌금", fund: "일반", order: 2 },
];
const items: ItemRef[] = [
  { id: 20, dept: "해외선교", deptOrder: 13, item: "선교사 후원", itemOrder: 1, fund: "별도" },
  { id: 8, dept: "관리부", deptOrder: 7, item: "공공요금", itemOrder: 8, fund: "일반" },
  { id: 2, dept: "관리부", deptOrder: 7, item: "인쇄비", itemOrder: 2, fund: "일반" },
];
const budgets = [
  { offeringTypeId: 1, expenseItemId: null, amount: 5000 },
  { offeringTypeId: 15, expenseItemId: null, amount: 600 },
  { offeringTypeId: null, expenseItemId: 8, amount: 2000 },
  { offeringTypeId: null, expenseItemId: 8, amount: 100 }, // 같은 항목이 두 줄이어도 합산
];

describe("결산", () => {
  it("헌금구분별 예산 대비 수입, 기금 소계", () => {
    const r = settleIncome(types, budgets, inc, 2026);
    expect(r.rows.map((x) => x.type)).toEqual(["십일조", "건축", "해외선교"]); // 기금·순서, 예산·실적 없는 주일헌금 제외
    expect(r.rows[0]).toMatchObject({ budget: 5000, actual: 2500 });
    expect(r.operating).toEqual({ budget: 5000, actual: 3000 });
    expect(r.funds.find((f) => f.fund === "별도")).toEqual({ fund: "별도", budget: 600, actual: 300 }); // 네팔선교는 기준정보에 없어 빠짐
  });
  it("부서·항목별 예산 대비 지출", () => {
    const r = settleExpense(items, budgets, exp, 2026);
    expect(r.depts.map((d) => d.dept)).toEqual(["관리부", "해외선교"]);
    expect(r.depts[0].items.map((i) => i.item)).toEqual(["인쇄비", "공공요금"]);
    expect(r.depts[0]).toMatchObject({ budget: 2100, actual: 1500 });
    expect(r.operating).toEqual({ budget: 2100, actual: 1500 });
    expect(r.separate).toEqual({ budget: 0, actual: 200 });
  });
  it("차기 이월 = 이월 + 수입 − 지출 + 대체", () => {
    expect(fundNext({ fundId: 1, code: "general", name: "일반", kind: "general", carry: 100, income: 50, expense: 30, transferIn: 5, transferOut: 10 })).toBe(115);
  });
});

describe("내년도 예산", () => {
  const lines = planLines({
    types, items, budgets: [{ offeringTypeId: 1, expenseItemId: null, amount: 7000 }],
    prevBudgets: budgets, prevInc: inc.filter((r) => r.sunday < "2026"), prevExp: exp.filter((r) => r.sunday < "2026"),
    requests: [{ expenseItemId: 2, amount: 400 }, { expenseItemId: 2, amount: 100 }],
  });
  it("줄 구성: 전년 예산·실적, 승인 신청", () => {
    expect(lines.filter((l) => l.kind === "income").map((l) => l.label)).toEqual(["십일조", "주일헌금", "건축", "해외선교"]);
    expect(lines.find((l) => l.key === "o1")).toMatchObject({ amount: 7000, prevBudget: 5000, prevActual: 10000 });
    expect(lines.find((l) => l.key === "e8")).toMatchObject({ amount: 0, prevBudget: 2100, prevActual: 300 });
    expect(lines.find((l) => l.key === "e2")).toMatchObject({ requested: 500 });
  });
  it("전년 복사·저장 payload(0원 제외)·소계", () => {
    const copied = copyPrevBudget(lines);
    expect(toBudgetPayload(copied)).toEqual([
      { offering_type_id: 1, amount: 5000 }, { offering_type_id: 15, amount: 600 }, { expense_item_id: 8, amount: 2100 },
    ]);
    const g = planGroups(copied);
    expect(g.find((x) => x.group === "관리부")).toMatchObject({ amount: 2100, requested: 500 });
  });
});

describe("보고서 데이터 바꿔 끼우기", () => {
  it("재직회·감사보고서 계산 함수에 그대로 넣을 수 있다", () => {
    const bi = toBudgetItems(items, budgets);
    expect(bi).toEqual([{ dept: "관리부", item: "인쇄비", budget: 0 }, { dept: "관리부", item: "공공요금", budget: 2100 }]); // 별도 기금 제외
    const tx = toExpenseTx([
      { date: "2026-10-04", dept: "관리부", item: "공공요금", fund: "일반", content: "전기요금", amount: 700, memo: "" },
      { date: "2026-10-04", dept: "해외선교", item: "선교사 후원", fund: "별도", content: "가 선교사", amount: 200, memo: "" },
    ]);
    expect(tx).toHaveLength(1);
    const rows = spendingStatus(bi, tx, "2026-01-01", "2026-12-31");
    expect(rows[0]).toMatchObject({ kind: "total", budget: 2100, spent: 700 });

    const ib = toIncomeBudgets(types, budgets);
    expect(ib.map((b) => b.type)).toEqual(["십일조", "주일헌금", "건축", "해외선교"]);
    const t = incomeTable(ib, toIncomeTx(inc), auditPeriods(2026, "H2"));
    expect(t.general.amounts[1]).toBe(3000); // 연간 일반·특별
    expect(t.separate.amounts[1]).toBe(400);
    expect(expenseTable(bi, tx, auditPeriods(2026, "H2")).total.amounts[0]).toBe(700);
  });
});
