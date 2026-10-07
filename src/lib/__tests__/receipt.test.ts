import { describe, expect, it } from "vitest";
import { aggregateIncome, allocate, fromDetail, ratiosOk, receiptLines, splitAggregate, toDetail, type IncomeRow } from "../receipt/calc";
import { brnChecksumOk, maskRrn, normalizeBrn, normalizePhone, normalizeRrn, rrnFrontQuery, splitNames } from "../receipt/validate";
import { dataUrlBytes, fitWithin } from "../receipt/image";
import { ledgerRows, ledgerTotal, matchReceipt, type LedgerRow } from "../receipt/ledger";
import { nextSerial, receiptNo } from "../receiptNo";

const row = (o: Partial<IncomeRow>): IncomeRow => ({ offering_type: "십일조", type_order: 1, month: 1, member_id: 1, member_name: "가나다", payer_label: "가나다", amount: 0, ...o });

describe("가족 합산", () => {
  const rows = [
    row({ amount: 100000 }),
    row({ month: 2, amount: 100000 }),
    row({ offering_type: "범사감사", type_order: 3, month: 2, member_id: 2, member_name: "가나라", payer_label: null, amount: 30000 }),
    row({ offering_type: "범사감사", type_order: 3, month: 3, member_id: null, member_name: null, payer_label: "가나다,가나라", amount: 50000 }),
  ];
  const agg = aggregateIncome(rows);
  it("합계·헌금구분·월·표기", () => {
    expect(agg.total).toBe(280000);
    expect(agg.types).toEqual([{ name: "십일조", amount: 200000 }, { name: "범사감사", amount: 80000 }]);
    expect(agg.months).toEqual([{ month: 1, amount: 100000 }, { month: 2, amount: 130000 }, { month: 3, amount: 50000 }]);
    expect(agg.sources.map((s) => s.payer_label)).toEqual(["가나다", "가나다,가나라", "가나라"]); // 표기 없으면 교인 이름
  });
  it("detail 저장·되읽기", () => {
    const d = toDetail(agg);
    expect(d.months).toEqual({ "01": 100000, "02": 130000, "03": 50000 });
    expect(fromDetail(d).types).toEqual(agg.types);
  });
  it("부부 비율 분할: 합이 원래 금액과 같다", () => {
    const [a, b] = splitAggregate(agg, [60, 40]);
    expect(a.total + b.total).toBe(agg.total);
    expect(a.total).toBe(168000);
    a.types.forEach((t, i) => expect(t.amount + b.types[i].amount).toBe(agg.types[i].amount));
    expect(ratiosOk([60, 40])).toBe(true);
    expect(ratiosOk([60, 50])).toBe(false);
  });
});

describe("배분", () => {
  it("끝수까지 정확히", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1001, [50, 50])).toEqual([501, 500]);
    expect(allocate(500, [0, 0])).toEqual([500, 0]);
    expect(allocate(0, [3, 1])).toEqual([0, 0]);
  });
  it("영수증 기부내용 줄: 월별, 합계 = 발행금액", () => {
    const lines = receiptLines(2025, { types: {}, months: { "01": 100000, "02": 300000 } }, 500000);
    expect(lines).toEqual([
      { date: "2025.01.01~2025.01.31", content: "헌금", amount: 125000 },
      { date: "2025.02.01~2025.02.28", content: "헌금", amount: 375000 },
    ]);
    expect(receiptLines(2025, null, 70000)).toEqual([{ date: "2025.01.01~2025.12.31", content: "헌금", amount: 70000 }]);
  });
});

describe("입력값", () => {
  it("주민번호", () => {
    expect(normalizeRrn("9001011234567")).toBe("900101-1234567");
    expect(normalizeRrn("900101-9234567")).toBeNull();
    expect(normalizeRrn("123")).toBeNull();
    expect(maskRrn("900101-1234567")).toBe("900101-1******");
  });
  it("검색은 앞 6자리만", () => {
    expect(rrnFrontQuery("900101")).toBe("900101");
    expect(rrnFrontQuery("900101-1234567")).toBe("900101");
    expect(rrnFrontQuery("가나다")).toBeNull();
    expect(rrnFrontQuery("1234")).toBeNull();
  });
  it("휴대폰·사업자번호·가족명단", () => {
    expect(normalizePhone("01012345678")).toBe("010-1234-5678");
    expect(normalizePhone("011-123-4567")).toBe("011-123-4567");
    expect(normalizePhone("02-123-4567")).toBeNull();
    expect(normalizeBrn("1234567890")).toBe("123-45-67890");
    expect(normalizeBrn("12345")).toBeNull();
    expect(brnChecksumOk("220-81-62517")).toBe(true); // 공개된 형식 예시
    expect(brnChecksumOk("123-45-67890")).toBe(false);
    expect(splitNames("가나라, 가나마/가나라  가나바")).toEqual(["가나라", "가나마", "가나바"]);
  });
});

describe("이미지", () => {
  it("크기 맞추기·바이트", () => {
    expect(fitWithin(1200, 600, 600)).toEqual({ w: 600, h: 300 });
    expect(fitWithin(100, 50, 600)).toEqual({ w: 100, h: 50 });
    expect(dataUrlBytes("data:image/png;base64,QUJD")).toBe(3);
    expect(dataUrlBytes("data:image/png;base64,QQ==")).toBe(1);
  });
});

describe("발행현황·관리대장", () => {
  const r: LedgerRow = { serial_no: "2025-PN001-0115", donor_name: "가나다", donor_kind: "PN", donor_rrn_masked: "900101-1******", rrn_front: "900101",
    donor_brn: null, donor_address: "서울시 가상로 1", issued_amount: 1200000, issued_at: "2026-01-15", status: "issued" };
  it("검색", () => {
    expect(matchReceipt(r, "가나")).toBe(true);
    expect(matchReceipt(r, "가상로")).toBe(true);
    expect(matchReceipt(r, "1,200,000")).toBe(true);
    expect(matchReceipt(r, "900101")).toBe(true);
    expect(matchReceipt(r, "900102")).toBe(false);
    expect(matchReceipt(r, "1234567")).toBe(false); // 뒷자리로는 못 찾는다
  });
  it("대장: 마스킹, 합계는 발행 건만", () => {
    expect(ledgerRows([r])[0]).toEqual(["2025-PN001-0115", "가나다", "900101-1******", 1200000, "2026-01-15", "발행"]);
    expect(ledgerTotal([r, { ...r, status: "canceled" }])).toBe(1200000);
  });
  it("발행번호 규칙(DB 함수와 같은 모양)", () => {
    expect(receiptNo(2025, "CP", 12, new Date(2026, 0, 5))).toBe("2025-CP012-0105");
    expect(nextSerial(["2025-PN001-0105", "2025-PN007-0110", "2025-CP002-0105"], 2025, "PN")).toBe(8);
  });
});
