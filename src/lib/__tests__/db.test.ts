import { describe, expect, it } from "vitest";
import { expenseProblems, expenseSig, fromExpenseRows, fromIncomeRows, incomeSig, toExpensePayload, toIncomePayload, type ExpenseRow, type IncomeEntry } from "../db/weekly";
import { mapDepartments, mapMember, mapOfferingType } from "../db/refData";
import { safeNext } from "../supabase/config";

const inc: IncomeEntry = { id: "a", typeId: 1, channel: "cash", memberId: 3, name: "가나다", amount: 100000, memo: "" };
const exp: ExpenseRow = { id: "b", content: " 전기요금 ", amount: 300000, dept: "관리부", item: "공공요금", requester: "", memo: "", source: "고정", fileId: "f1" };

describe("주간 입력 ↔ DB", () => {
  it("수입 payload와 되읽기", () => {
    expect(toIncomePayload([inc, { ...inc, id: "db-7" }]).map((r) => r.id)).toEqual([null, 7]);
    expect(toIncomePayload([inc])).toEqual([{ id: null, offering_type_id: 1, member_id: 3, payer_label: "가나다", channel: "cash", amount: 100000, memo: null }]);
    const back = fromIncomeRows([{ id: 9, offering_type_id: 1, member_id: 3, payer_label: "가나다", channel: "cash", amount: 100000, memo: null }]);
    expect(incomeSig(back)).toBe(incomeSig([inc])); // 저장 직후 다시 불러오면 '저장됨'
  });
  it("지출 payload와 되읽기", () => {
    expect(toExpensePayload([exp])[0]).toMatchObject({ dept: "관리부", item: "공공요금", content: "전기요금", drive_file_id: "f1" });
    const back = fromExpenseRows([{ id: 1, content: "전기요금", amount: 300000, requester_label: null, memo: null, source: "고정",
      expense_item: { name: "공공요금", department: { name: "관리부" } }, receipt_file: { drive_file_id: "f1" } }]);
    expect(expenseSig(back)).toBe(expenseSig([exp]));
  });
  it("저장 전 빠진 칸 알림", () => {
    expect(expenseProblems([exp, { ...exp, amount: 0, item: "" }])).toEqual(["2행: 금액·항목 없음"]);
  });
});

describe("기준정보 변환", () => {
  it("헌금구분·교인·부서", () => {
    expect(mapOfferingType({ id: 2, name: "주일헌금", total_only: true, amount_unit: 1, has_memo: false, fund: { kind: "general" } }))
      .toEqual({ id: 2, name: "주일헌금", fund: "일반", totalOnly: true });
    expect(mapOfferingType({ id: 15, name: "해외선교", total_only: false, amount_unit: 1000, has_memo: false, fund: { kind: "separate" } }).fund).toBe("별도");
    expect(mapMember({ id: 1, name: "김민준", name_suffix: "A", title: null, display_rank: null })).toEqual({ id: 1, name: "김민준A" });
    expect(mapDepartments([{ name: "공공요금", department: { name: "관리부", sort_order: 7 } }, { name: "인쇄비", department: { name: "관리부", sort_order: 7 } }]))
      .toEqual({ 관리부: ["공공요금", "인쇄비"] });
  });
});

describe("로그인 후 이동 주소", () => {
  it("사이트 안 경로만", () => {
    expect(safeNext("/income/entry")).toBe("/income/entry");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
  });
});

describe("이번 주일", () => {
  it("주일 아침(현지 시각)에도 그날", async () => {
    const { currentSunday } = await import("../demo");
    expect(currentSunday(new Date(2026, 9, 4, 7, 0))).toBe("2026-10-04"); // 주일 07시
    expect(currentSunday(new Date(2026, 9, 7, 23, 30))).toBe("2026-10-04"); // 수요일 밤
  });
});
