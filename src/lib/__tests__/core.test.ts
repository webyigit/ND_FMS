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

import { koreanAmount } from "../koreanAmount";
describe("한글 금액", () => {
  it("변환", () => {
    expect(koreanAmount(160500000)).toBe("일억육천오십만원");
    expect(koreanAmount(370000000)).toBe("삼억칠천만원");
    expect(koreanAmount(1001)).toBe("일천일원");
    expect(koreanAmount(0)).toBe("영원");
  });
});

import { spendingStatus, rate, missionLedger } from "../officersReport";
describe("재직회보고서", () => {
  const budgets = [{ dept: "A부", item: "x", budget: 100 }, { dept: "A부", item: "y", budget: 50 }, { dept: "B부", item: "z", budget: 200 }];
  const txs = [
    { date: "2026-01-04", dept: "A부", item: "x", content: "", amount: 30 },
    { date: "2026-02-01", dept: "B부", item: "z", content: "", amount: 50 },
    { date: "2026-12-27", dept: "A부", item: "y", content: "", amount: 10 }, // 기준일 이후 제외
  ];
  it("합계·소계 순서와 기준일", () => {
    const r = spendingStatus(budgets, txs, "2026-01-01", "2026-10-05");
    expect(r.map((x) => x.kind)).toEqual(["total", "subtotal", "item", "item", "subtotal", "item"]);
    expect(r[0]).toMatchObject({ budget: 350, spent: 80 });
    expect(r[1]).toMatchObject({ dept: "A부", budget: 150, spent: 30 });
    expect(rate(30, 150)).toBe("20.00%");
    expect(rate(5, 0)).toBe("-");
  });
  it("해외선교 원장", () => {
    const { rows, summary } = missionLedger(100, [
      { date: "2026-01-04", content: "헌금수입", income: 20, expense: 0 },
      { date: "2026-01-25", content: "송금", income: 0, expense: 30 },
      { date: "2026-02-01", content: "헌금수입", income: 10, expense: 0 },
    ], 2026);
    expect(summary).toEqual({ carry: 100, income: 30, sum: 130, expense: 30, balance: 100 });
    expect(rows.filter((r) => r.kind === "month").map((r) => (r as { month: number }).month)).toEqual([1, 2]);
  });
});

import { fileKind, parseExpenseSheet, parseCsv } from "../expenseUpload";
describe("지출증빙 올리기", () => {
  it("파일 종류", () => {
    expect(fileKind("영수증.PDF")).toBe("pdf");
    expect(fileKind("IMG_0001.HEIC")).toBe("image");
    expect(fileKind("camera.jpg", "image/jpeg")).toBe("image");
    expect(fileKind("지출.xlsx")).toBe("excel");
    expect(fileKind("지출.xls")).toBe("unsupported");
  });
  it("일반 엑셀: 제목 줄 찾기, 합계·0원 건너뜀", () => {
    const r = parseExpenseSheet([
      ["2026년 지출내역"], [],
      ["순번", "일자", "내 용", "금액", "부서", "항목", "청구자", "비고"],
      [1, "2026.10.04", "주보 인쇄", "120,000", "관리부", "인쇄비", "홍길동", ""],
      [2, new Date("2026-10-04T00:00:00Z"), "꽃 구입", 50000, "예배부", "부활절행사", "", "카드"],
      ["", "", "합계", 170000],
      [3, "", "취소건", 0],
    ]);
    expect(r.format).toBe("일반");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: "2026-10-04", content: "주보 인쇄", amount: 120000, dept: "관리부", item: "인쇄비" });
    expect(r.rows[1].date).toBe("2026-10-04");
    expect(r.skipped).toBe(2);
  });
  it("인식 불가와 CSV", () => {
    expect(parseExpenseSheet([["a", "b"], [1, 2]]).format).toBe("인식불가");
    const rows = parseCsv('내용,금액\r\n"사무용품, 복사지",30000\n');
    expect(parseExpenseSheet(rows).rows[0]).toMatchObject({ content: "사무용품, 복사지", amount: 30000 });
  });
});

import { receiptFileName, receiptFolder } from "../drive";
describe("드라이브 증빙 이름 규칙", () => {
  it("연/월 폴더와 파일명", () => {
    expect(receiptFolder("2026-10-04")).toEqual(["지출증빙", "2026", "10"]);
    expect(receiptFileName({ date: "2026-10-04", dept: "관리부", content: "주보 인쇄/10월", amount: 120000, ext: "JPG", id: "ab12cd34" }))
      .toBe("261004_관리부_주보-인쇄-10월_120000원_ab12.jpg");
    expect(receiptFileName({ date: "2026-10-04", ext: "pdf", id: "ffff0000" })).toBe("261004_미지정_증빙_ffff.pdf");
  });
});
