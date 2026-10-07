import { describe, expect, it } from "vitest";
import { exportRows, matchMember, normalizePhone, normalizeRrn, parseMemberSheet, previewImport, sortMembers, type MemberRow } from "../settings/members";
import { cleanAccountNo, findPayeeAccount, isAccountNo, pickPayee, type PayeeAccount } from "../settings/payee";
import { dayRange, diffRows, secretChanged } from "../settings/audit";
import { flattenTree, moveType, type OtRow } from "../settings/offeringTypes";

const m = (p: Partial<MemberRow>): MemberRow => ({
  id: 1, name: "가나다", name_suffix: null, full_name: "가나다", title: null, display_rank: null, district: null, zone: null,
  service_dept: null, service_role: null, phone: null, address: null, is_group: false, is_anonymous: false, exclude_from_receipt: false,
  active: true, household_id: null, household_label: null, is_household_head: false, has_rrn: false, rrn_mask: null, ...p,
});

describe("교인명단", () => {
  it("검색: 이름·직분·교구·구역", () => {
    const x = m({ full_name: "가나다A", title: "집사", district: "1교구", zone: "3구역" });
    expect(matchMember(x, "나다")).toBe(true);
    expect(matchMember(x, "집사")).toBe(true);
    expect(matchMember(x, "1 교구")).toBe(true);
    expect(matchMember(x, "장로")).toBe(false);
  });
  it("노출순서 먼저, 나머지 가나다", () => {
    const xs = [m({ id: 1, full_name: "하하" }), m({ id: 2, full_name: "다다", display_rank: 2 }), m({ id: 3, full_name: "가가" }), m({ id: 4, full_name: "라라", display_rank: 1 })];
    expect(sortMembers(xs).map((x) => x.id)).toEqual([4, 2, 3, 1]);
  });
  it("주민번호·휴대폰 형식", () => {
    expect(normalizeRrn("9001011234567")).toBe("900101-1234567");
    expect(normalizeRrn("900101-123456")).toBeNull();
    expect(normalizePhone("01000000000")).toBe("010-0000-0000");
    expect(normalizePhone("02-123-4567")).toBe("02-123-4567");
  });
  it("엑셀 일괄 등록: 머리글 찾기·미리보기", () => {
    const rows = parseMemberSheet([["교인 명단"], [], ["성명", "직분", "교구", "구역", "휴대전화"], ["가나다", "집사", "1교구", "2구역", "01011112222"], ["라마바", "", "", "", ""], ["가나다"], [null, null]]);
    expect(rows).toEqual([
      { name: "가나다", name_suffix: "", title: "집사", district: "1교구", zone: "2구역", phone: "010-1111-2222" },
      { name: "라마바", name_suffix: "", title: "", district: "", zone: "", phone: "" },
      { name: "가나다", name_suffix: "", title: "", district: "", zone: "", phone: "" },
    ]);
    expect(previewImport(rows!, ["라마바"]).map((r) => r.status)).toEqual(["new", "exists", "dup"]);
    expect(parseMemberSheet([["a", "b"]])).toBeNull();
  });
  it("내려받기는 마스킹 값만", () => {
    const out = exportRows([m({ rrn_mask: "900101-1******", is_household_head: true })]);
    expect(out[1]).toContain("900101-1******");
    expect(JSON.stringify(out)).not.toContain("1234567");
  });
});

describe("송금 계좌 찾기", () => {
  const rows: PayeeAccount[] = [
    { id: 3, name: "가나다 집사", member_name: "가나다", bank: "가상은행", holder: "가나다", account_no: "1" },
    { id: 1, name: "가나다", member_name: null, bank: "나상은행", holder: "가나다", account_no: "2" },
    { id: 2, name: "업체", member_name: null, bank: "다상은행", holder: "라마바", account_no: "3" },
  ];
  it("송금 이름 > 교인 > 예금주", () => {
    expect(pickPayee(rows, "가나다")?.id).toBe(1);
    expect(pickPayee(rows, "가나다집사")?.id).toBe(3);
    expect(pickPayee(rows, "라마바")?.id).toBe(2);
    expect(pickPayee(rows, "없음")).toBeNull();
    expect(pickPayee(rows, " ")).toBeNull();
  });
  it("DB 함수 호출", async () => {
    const calls: unknown[] = [];
    const sb = { rpc: async (fn: string, args: unknown) => { calls.push([fn, args]); return { data: rows, error: null }; } };
    const p = await findPayeeAccount(sb as never, " 업체 ");
    expect(p?.account_no).toBe("3");
    expect(calls).toEqual([["payee_accounts", { p_names: ["업체"] }]]);
  });
  it("계좌번호 정리", () => {
    expect(cleanAccountNo("301 1234-5678 (농협)")).toBe("3011234-5678");
    expect(isAccountNo("123-45")).toBe(false);
    expect(isAccountNo("123-456")).toBe(true);
  });
});

describe("사용내역", () => {
  it("바뀐 칸 먼저, 암호화 칸은 숨김", () => {
    const d = diffRows({ id: 1, name: "가", title: "집사", rrn_enc: "(암호화됨)", x: "\\x0a0b" }, { id: 1, name: "가", title: "권사", rrn_enc: "(새로 입력됨)", x: "\\x0c" });
    expect(d.map((l) => l.key)).toEqual(["title", "id", "name"]);
    expect(d[0]).toEqual({ key: "title", before: "집사", after: "권사", changed: true });
    expect(secretChanged({ rrn_enc: "(새로 입력됨)" })).toEqual(["rrn_enc"]);
  });
  it("기간: 끝 날짜 포함", () => {
    expect(dayRange("2026-10-01", "2026-10-07")).toEqual({ gte: "2026-10-01T00:00:00+09:00", lt: "2026-10-07T15:00:00.000Z" });
    expect(dayRange("", "")).toEqual({ gte: null, lt: null });
  });
});

describe("헌금구분", () => {
  const ot = (id: number, sort: number, parent: number | null = null): OtRow =>
    ({ id, name: `t${id}`, fund_id: 1, parent_id: parent, total_only: false, amount_unit: 1, has_memo: false, sort_order: sort, active: true });
  const rows = [ot(1, 1), ot(2, 2), ot(3, 3, 2), ot(4, 4, 2), ot(5, 5)];
  it("상위 > 하위로 펼침", () => {
    expect(flattenTree(rows).map((r) => `${r.id}:${r.depth}`)).toEqual(["1:0", "2:0", "3:1", "4:1", "5:0"]);
  });
  it("같은 단계 안에서만 이동", () => {
    expect(moveType(rows, 5, -1)).toEqual([1, 5, 2, 3, 4]);
    expect(moveType(rows, 4, -1)).toEqual([1, 2, 4, 3, 5]);
    expect(moveType(rows, 3, -1)).toBeNull();
    expect(moveType(rows, 1, -1)).toBeNull();
  });
});
