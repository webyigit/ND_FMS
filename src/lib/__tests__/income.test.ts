import { describe, expect, it } from "vitest";
import { classifyDeposit, keywordsFor } from "../classify";
import { parseDateTime } from "../bank/nonghyup";
import { addDays, isSunday, kstDate, kstDateTime, sundayOf } from "../income/dates";
import { linkProblems, suggest, toImportRows, toLinkPayload } from "../income/bank";
import { fetchAll, safeTerm } from "../income/db";
import {
  filterByName, householdTotals, matrixSheet, personSheet, personTotals, sumSelected, toGrid, typeMonthMatrix,
  weeklyReport, weeklySheets, type IncomeViewRow, type PersonAggRow,
} from "../income/report";

// 테스트 데이터는 모두 가상(실명·실금액 아님)
const types = [
  { id: 1, name: "십일조", fund: "일반" as const },
  { id: 2, name: "주일헌금", fund: "일반" as const, totalOnly: true },
  { id: 12, name: "이웃사랑", fund: "특별" as const },
  { id: 15, name: "해외선교", fund: "별도" as const },
];
const members = [
  { id: 10, name: "가나다" },
  { id: 11, name: "라마바" },
  { id: 12, name: "사아자", aliases: ["아자"] },
];

describe("날짜·반영 주일", () => {
  it("한국 날짜와 주일", () => {
    expect(kstDate("2026-10-10T16:00:00+00:00")).toBe("2026-10-11"); // UTC 토요일 밤 = 한국 주일
    expect(kstDateTime("2026-10-14T01:05:00Z")).toBe("2026-10-14 10:05");
    expect(sundayOf("2026-10-14")).toBe("2026-10-11");
    expect(sundayOf("2026-10-14", "next")).toBe("2026-10-18");
    expect(sundayOf("2026-10-11")).toBe("2026-10-11");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isSunday("2026-10-11")).toBe(true);
    expect(isSunday("2026-10-12")).toBe(false);
  });
  it("엑셀 날짜 셀은 한국 시각으로", () => {
    expect(parseDateTime(new Date(Date.UTC(2026, 9, 4, 10, 11, 12)))).toBe("2026-10-04T10:11:12+09:00");
  });
});

describe("자동분류", () => {
  const kw = keywordsFor(types);
  it("헌금구분 이름도 키워드", () => {
    expect(kw.find((k) => k.offeringTypeId === 15)?.keywords).toEqual(["해외선교", "선교"]);
  });
  it("앞에 붙은 키워드·공백·괄호", () => {
    expect(classifyDeposit("십일조 가나다", kw, members)).toMatchObject({ offeringTypeId: 1, memberIds: [10] });
    expect(classifyDeposit("(가나다,라마바) 이웃사랑", kw, members)).toMatchObject({ offeringTypeId: 12, memberIds: [10, 11] });
  });
  it("제안: 가족 묶음은 첫 사람이 대표, 표기는 이어서", () => {
    expect(suggest("가나다라마바십일조", kw, members)).toEqual({ typeId: 1, memberId: 10, payerLabel: "가나다,라마바", source: "keyword" });
    expect(suggest("아자선교", kw, members)).toMatchObject({ typeId: 15, memberId: 12, payerLabel: "사아자" });
    expect(suggest("미등록십일조", kw, members)).toMatchObject({ typeId: 1, memberId: null, payerLabel: "미등록" });
    expect(suggest("가나다", kw, members, [{ description: "가 나 다", offeringTypeId: 12, memberId: 10 }])).toMatchObject({ typeId: 12, source: "history" });
  });
  it("올리기 payload: 출금은 제안 없음", () => {
    const tx = { txAt: "2026-10-14T10:00:00+09:00", withdraw: 0, deposit: 1000, balance: 5000, txType: "인터넷", description: "가나다십일조", branch: "", transferMemo: "", txMemo: "" };
    const rows = toImportRows([tx, { ...tx, deposit: 0, withdraw: 500 }], (t) => suggest(t.description, kw, members));
    expect(rows[0]).toMatchObject({ tx_at: tx.txAt, suggested_offering_type_id: 1, suggested_member_id: 10, transfer_memo: "" });
    expect(rows[1]).toMatchObject({ suggested_offering_type_id: null, suggested_member_id: null });
  });
  it("반영 payload와 점검", () => {
    const d = { txId: 3, description: "가나다", typeId: 1, memberId: 10, payerLabel: " 가나다 ", memo: "", sunday: "2026-10-11" };
    expect(linkProblems([d, { ...d, typeId: null, sunday: "2026-10-12" }])).toEqual(["가나다: 헌금구분 없음·주일 날짜 아님"]);
    expect(toLinkPayload([d])).toEqual([{ bank_tx_id: 3, offering_type_id: 1, member_id: 10, payer_label: "가나다", memo: null, sunday: "2026-10-11" }]);
  });
});

const row = (p: Partial<IncomeViewRow>): IncomeViewRow => ({
  id: 1, sunday: "2026-10-11", offering_type_id: 1, offering_type: "십일조", type_order: 1, fund_kind: "general",
  member_id: null, member_name: null, payer_label: null, channel: "cash", amount: 0, memo: null, bank_tx_id: null, ...p,
});

describe("금주 수입내역", () => {
  const rows = [
    row({ member_id: 10, member_name: "가나다", payer_label: "가나다", amount: 100000 }),
    row({ member_id: 11, member_name: "라마바", payer_label: "라마바", amount: 50000, channel: "online" }),
    row({ member_id: 1, member_name: "하원로", payer_label: "하원로", amount: 30000 }),
    row({ offering_type_id: 2, offering_type: "주일헌금", payer_label: "(총액)", amount: 400000 }),
    row({ offering_type_id: 12, offering_type: "이웃사랑", fund_kind: "special", payer_label: "가나다,라마바", amount: 20000, memo: "가상" }),
    row({ offering_type_id: 15, offering_type: "해외선교", fund_kind: "separate", payer_label: "가나다", amount: 70000, channel: "online" }),
    row({ offering_type_id: 99, offering_type: "옛구분", type_order: 50, payer_label: "가나다", amount: 1000 }),
  ];
  const rep = weeklyReport(rows, types, (id) => (id === 1 ? 1 : null));
  it("소계·현금/이체·기금 합계(별도 제외)", () => {
    const tithe = rep.types.find((t) => t.id === 1)!;
    expect(tithe).toMatchObject({ cash: 130000, online: 50000, total: 180000, count: 3 });
    expect(tithe.entries.map((e) => e.name)).toEqual(["하원로", "가나다", "라마바"]); // 지정 순위 먼저, 나머지 가나다
    expect(rep.byFund.일반.total).toBe(581000);
    expect(rep.byFund.특별.total).toBe(20000);
    expect(rep.byFund.별도).toEqual({ cash: 0, online: 70000, total: 70000 });
    expect(rep.generalSpecial.total).toBe(601000);
    expect(rep.grand).toEqual({ cash: 551000, online: 120000, total: 671000 });
    expect(rep.types.map((t) => t.id)).toEqual([1, 2, 12, 15, 99]); // 목록 밖 헌금구분도 포함
  });
  it("그리드 4칸·엑셀", () => {
    expect(toGrid([1, 2, 3, 4, 5])).toEqual([[1, 2, 3, 4], [5, null, null, null]]);
    const [summary, grid] = weeklySheets(rep, "2026-10-11");
    expect(summary.rows.at(-1)).toEqual(["총계(별도 포함)", "", 551000, 120000, 671000, 7]);
    expect(summary.rows).toContainEqual(["일반·특별 합계", "", 551000, 50000, 601000, null]);
    expect(grid.rows.flat()).toContain("가나다,라마바(가상)");
    expect(grid.rows.flat()).not.toContain("(총액)"); // 주일헌금은 명단 없이 총액만
  });
});

const prow = (p: Partial<PersonAggRow>): PersonAggRow => ({
  year: 2026, month: 1, member_id: null, member_name: null, household_id: null, household_label: null, payer_label: null,
  offering_type_id: 1, offering_type: "십일조", type_order: 1, fund_kind: "general", amount: 0, n: 1, ...p,
});

describe("개인별 헌금현황", () => {
  const rows = [
    prow({ member_id: 10, member_name: "가나다", household_id: 5, household_label: "가나다 가정", amount: 100000 }),
    prow({ member_id: 10, member_name: "가나다", household_id: 5, household_label: "가나다 가정", month: 3, offering_type_id: 12, offering_type: "이웃사랑", type_order: 12, amount: 20000 }),
    prow({ member_id: 11, member_name: "라마바", household_id: 5, household_label: "가나다 가정", amount: 50000 }),
    prow({ member_id: 12, member_name: "사아자", amount: 30000, n: 2 }),
    prow({ payer_label: "미등록", amount: 7000 }),
  ];
  const ps = personTotals(rows);
  it("개인별 합계·월별", () => {
    expect(ps.map((p) => [p.name, p.total])).toEqual([["가나다", 120000], ["라마바", 50000], ["미등록", 7000], ["사아자", 30000]]);
    expect(ps[0].byType).toEqual({ 1: 100000, 12: 20000 });
    expect(ps[0].byMonth.slice(0, 3)).toEqual([100000, 0, 20000]);
    expect(ps.find((p) => p.name === "사아자")?.n).toBe(2);
  });
  it("가족 합산·검색·선택 합계", () => {
    const hs = householdTotals(ps);
    const fam = hs.find((h) => h.key === "h5")!;
    expect(fam).toMatchObject({ name: "가나다 가정", total: 170000, members: ["가나다", "라마바"] });
    expect(hs).toHaveLength(3);
    expect(filterByName(hs, "라마").map((h) => h.key)).toEqual(["h5"]);
    expect(sumSelected(ps, new Set(["m10", "m12"]))).toMatchObject({ count: 2, total: 150000, byType: { 1: 130000, 12: 20000 } });
    const sheet = personSheet(2026, hs, [{ id: 1, name: "십일조" }, { id: 12, name: "이웃사랑" }], true);
    expect(sheet.rows.at(-1)).toEqual(["합계", "", 187000, 20000, 207000]);
  });
});

describe("과거 수입 리포트", () => {
  it("헌금구분 × 월", () => {
    const m = typeMonthMatrix([
      { month: 1, offering_type_id: 12, offering_type: "이웃사랑", type_order: 12, fund_kind: "special", amount: 10 },
      { month: 1, offering_type_id: 1, offering_type: "십일조", type_order: 1, fund_kind: "general", amount: 100 },
      { month: 2, offering_type_id: 1, offering_type: "십일조", type_order: 1, fund_kind: "general", amount: 50 },
      { month: 2, offering_type_id: 15, offering_type: "해외선교", type_order: 15, fund_kind: "separate", amount: 7 },
    ]);
    expect(m.types.map((t) => [t.name, t.total])).toEqual([["십일조", 150], ["이웃사랑", 10], ["해외선교", 7]]);
    expect(m.monthTotals.slice(0, 2)).toEqual([110, 57]);
    expect(m.byFund.별도[1]).toBe(7);
    const s = matrixSheet("리포트", "2026년", m);
    expect(s.rows.find((r) => r[0] === "일반·특별 합계")?.at(-1)).toBe(160);
    expect(s.rows.at(-1)?.at(-1)).toBe(167);
  });
});

describe("DB 도우미", () => {
  it("1000행씩 나눠 모두 읽기", async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i);
    const calls: number[] = [];
    const got = await fetchAll((a, b) => { calls.push(a); return Promise.resolve({ data: all.slice(a, b + 1), error: null }); });
    expect(got).toHaveLength(2500);
    expect(calls).toEqual([0, 1000, 2000]);
    await expect(fetchAll(() => Promise.resolve({ data: null, error: { message: "x" } }))).rejects.toMatchObject({ message: "x" });
  });
  it("검색어 정리", () => {
    expect(safeTerm(" 가나,다(%) ")).toBe("가나다");
  });
});
