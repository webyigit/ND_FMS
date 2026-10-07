import { describe, expect, it } from "vitest";
import { parseNonghyupRows, parseAmount, isNonghyupFile } from "../bank/nonghyup";
import { classifyDeposit } from "../classify";
import { receiptNo, nextSerial } from "../receiptNo";
import { reconcile } from "../reconcile";
import { sortForList } from "../offeringOrder";

// 테스트 데이터는 모두 가상(실명·실금액 아님)
const rows = [
  [null, "입출금거래내역 조회 결과"],
  [null, "계좌번호", "***-****-****-**"],
  [],
  [null, "거래일시", "출금금액", "입금금액", "거래후잔액", null, "거래내용", null, "거래기록사항", "거래점", null, "이체메모", null, "거래메모"],
  [null, "2026/10/04 10:11:12", "", "50,000", "1,050,000", null, "인터넷당행", null, "홍길동십일조", "농협 001", null, "", null, ""],
  [null, "2026/10/03 09:00:00", "100,500", "", "1,000,000", null, "인터넷당행", null, "가나상회", "농협 001", null, "꽃값", null, ""],
  [null, "합계"],
];

describe("농협 파서", () => {
  it("헤더를 찾아 거래를 읽는다", () => {
    const tx = parseNonghyupRows(rows);
    expect(tx).toHaveLength(2);
    expect(tx[0]).toMatchObject({ deposit: 50000, withdraw: 0, balance: 1050000, description: "홍길동십일조" });
    expect(tx[0].txAt).toBe("2026-10-04T10:11:12+09:00");
    expect(tx[1]).toMatchObject({ withdraw: 100500, transferMemo: "꽃값" });
  });
  it("금액·파일명", () => {
    expect(parseAmount("1,234원")).toBe(1234);
    expect(isNonghyupFile("농협_입출금거래내역 결과_20261004-송금이후.xlsx")).toBe(true);
    expect(isNonghyupFile("국민_거래내역.xlsx")).toBe(false);
  });
});

describe("헌금 자동분류", () => {
  const kw = [
    { offeringTypeId: 1, keywords: ["십일조"] },
    { offeringTypeId: 2, keywords: ["네팔"] },
    { offeringTypeId: 3, keywords: ["범사"] },
  ];
  const members = [
    { id: 10, name: "홍길동" },
    { id: 11, name: "김영희" },
    { id: 12, name: "이몽룡", aliases: ["몽룡"] },
  ];
  it("이름+구분", () => {
    expect(classifyDeposit("홍길동십일조", kw, members)).toMatchObject({ offeringTypeId: 1, memberIds: [10], rest: "" });
  });
  it("가족 묶음", () => {
    expect(classifyDeposit("홍길동김영희네팔", kw, members).memberIds).toEqual([10, 11]);
  });
  it("별칭", () => {
    expect(classifyDeposit("몽룡범사", kw, members)).toMatchObject({ offeringTypeId: 3, memberIds: [12] });
  });
  it("과거 이력 우선", () => {
    const r = classifyDeposit("홍길동", kw, members, [{ description: "홍길동", offeringTypeId: 1, memberId: 10 }]);
    expect(r).toMatchObject({ source: "history", offeringTypeId: 1 });
  });
});

describe("기부금영수증 번호", () => {
  it("형식", () => {
    expect(receiptNo(2026, "PN", 1, new Date(2026, 9, 7))).toBe("2026-PN001-1007");
    expect(nextSerial(["2026-PN001-1007", "2026-PN012-1010", "2026-CP003-1001"], 2026, "PN")).toBe(13);
  });
});

describe("검증시트", () => {
  it("일치", () => {
    const r = reconcile({ bankBalance: 1000, pendingDeposit: 200, missionUnremitted: 100, ledgerBalance: 600, baseSurplus: 500 });
    expect(r).toMatchObject({ realBalance: 1200, accountBalance: 1100, available: 500, diff: 0, ok: true });
  });
});

describe("명단 순서", () => {
  it("지정 순위 다음 가나다", () => {
    const s = sortForList([{ name: "하나" }, { name: "가나" }, { name: "담임", displayRank: 2 }, { name: "원로", displayRank: 1 }]);
    expect(s.map((x) => x.name)).toEqual(["원로", "담임", "가나", "하나"]);
  });
});
