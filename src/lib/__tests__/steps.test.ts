import { describe, expect, it } from "vitest";
import { STEPS, asSunday, nextSunday, prevSunday, shortSunday, stepCounts, stepStatus, weekSteps, workSunday } from "../weekly/steps";

describe("매주 업무 순서", () => {
  it("단계는 요청한 순서 7개", () => {
    expect(STEPS.map((s) => s.label)).toEqual(["수입입력", "금주 수입내역", "은행거래내역입력", "지출입력", "검증", "금주 수입/지출 내역", "총계원장 확인"]);
    expect(STEPS.find((s) => s.key === "expense")?.href).toBe("/expense/entry?fixed=1");
    expect(STEPS.find((s) => s.key === "verify")?.href).toBe("/expense/verify");
  });
  it("상태: 완료 / 지난 주일 미완료 = 시행 안 됨 / 아니면 미완료", () => {
    expect(stepStatus(true, "2026-10-11", "2026-10-14")).toBe("done");
    expect(stepStatus(false, "2026-10-11", "2026-10-14")).toBe("missed");
    expect(stepStatus(false, "2026-10-18", "2026-10-14")).toBe("todo");
    expect(stepStatus(false, "2026-10-18", "2026-10-18")).toBe("todo"); // 주일 당일까지는 미완료
    expect(stepStatus(false, "2026-10-18", "2026-10-19")).toBe("missed");
  });
  it("주별 단계 상태와 건수", () => {
    const recs = [{ sunday: "2026-10-11", step: "income" as const, doneAt: "2026-10-07T01:00:00Z" }, { sunday: "2026-10-18", step: "income" as const, doneAt: "2026-10-14T01:00:00Z" }];
    const last = weekSteps("2026-10-11", recs, "2026-10-14");
    expect(last[0]).toMatchObject({ key: "income", status: "done", doneAt: "2026-10-07T01:00:00Z" });
    expect(last.slice(1).every((s) => s.status === "missed")).toBe(true);
    expect(stepCounts(last)).toEqual({ done: 1, missed: 6, total: 7 });
    const cur = weekSteps("2026-10-18", recs, "2026-10-14");
    expect(cur.map((s) => s.status)).toEqual(["done", "todo", "todo", "todo", "todo", "todo", "todo"]);
  });
  it("기준 주일은 돌아오는 주일, 이전·다음 주일", () => {
    expect(workSunday(new Date("2026-10-14T01:00:00Z"))).toBe("2026-10-18");
    expect(workSunday(new Date("2026-10-18T01:00:00Z"))).toBe("2026-10-18");
    expect(prevSunday("2026-10-18")).toBe("2026-10-11");
    expect(nextSunday("2026-10-18")).toBe("2026-10-25");
    expect(asSunday("2026-10-19", "2026-10-18")).toBe("2026-10-18");
    expect(shortSunday("2026-10-04")).toBe("10/4 주일");
  });
});
