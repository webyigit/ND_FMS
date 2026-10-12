import { describe, expect, it } from "vitest";
import { nextIndex } from "../listNav";

describe("자동완성 키보드 이동", () => {
  it("↓: 처음엔 첫 항목, 끝에서 처음으로", () => {
    expect(nextIndex(-1, 3, "ArrowDown")).toBe(0);
    expect(nextIndex(1, 3, "ArrowDown")).toBe(2);
    expect(nextIndex(2, 3, "ArrowDown")).toBe(0);
  });
  it("↑: 처음엔 마지막 항목, 처음에서 끝으로", () => {
    expect(nextIndex(-1, 3, "ArrowUp")).toBe(2);
    expect(nextIndex(0, 3, "ArrowUp")).toBe(2);
    expect(nextIndex(2, 3, "ArrowUp")).toBe(1);
  });
  it("빈 목록·다른 키", () => {
    expect(nextIndex(0, 0, "ArrowDown")).toBe(-1);
    expect(nextIndex(1, 3, "a")).toBe(1);
  });
});
