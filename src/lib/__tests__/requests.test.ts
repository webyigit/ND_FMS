import { describe, expect, it } from "vitest";
import { rankCandidates } from "../receipt/match";
import type { DonorHit } from "../receipt/api";
import { itemKey, toItems, unseen } from "../requests/pending";

// 가상 이름·번호 (실데이터 아님)
const hit = (o: Partial<DonorHit> & { member_id: number; name: string }): DonorHit =>
  ({ title: null, household_id: null, household_label: null, is_household_head: false, address: null, phone: null, rrn_masked: null, family: [], ...o });

describe("신청자 ↔ 교인 자동 매칭", () => {
  it("후보가 없으면 비어 있다", () => {
    expect(rankCandidates([], { name: "가나다" })).toEqual({ auto: null, candidates: [], reason: null });
  });
  it("같은 이름이 한 명이면 바로 확정", () => {
    const m = rankCandidates([hit({ member_id: 1, name: "가나다" })], { name: "가나다" });
    expect(m.auto?.member_id).toBe(1); expect(m.reason).toBe("name_only");
  });
  it("접미가 붙은 이름(가나다A) 한 명도 확정", () => {
    expect(rankCandidates([hit({ member_id: 1, name: "가나다A" })], { name: "가나다" }).auto?.member_id).toBe(1);
  });
  it("동명이인은 휴대폰으로 확정", () => {
    const hits = [hit({ member_id: 1, name: "가나다", phone: "010-1111-2222" }), hit({ member_id: 2, name: "가나다", phone: "010-3333-4444" })];
    const m = rankCandidates(hits, { name: "가나다", phone: "010-3333-4444" });
    expect(m.auto?.member_id).toBe(2); expect(m.reason).toBe("name_phone");
  });
  it("휴대폰이 안 맞으면 가족명단으로 확정", () => {
    const hits = [hit({ member_id: 1, name: "가나다", family: ["라마바"] }), hit({ member_id: 2, name: "가나다", family: ["사아자"] })];
    const m = rankCandidates(hits, { name: "가나다", phone: "010-0000-0000", family_names: ["사아자"] });
    expect(m.auto?.member_id).toBe(2); expect(m.reason).toBe("name_family");
  });
  it("근거가 없으면 후보를 돌려준다(정확히 같은 이름이 앞)", () => {
    const hits = [hit({ member_id: 1, name: "가나다라" }), hit({ member_id: 2, name: "가나다" })];
    const m = rankCandidates(hits, { name: "가나다" });
    expect(m.auto).toBeNull(); expect(m.candidates.map((c) => c.member_id)).toEqual([2, 1]);
  });
  it("휴대폰이 둘 다 맞으면(가족 공용) 확정하지 않는다", () => {
    const hits = [hit({ member_id: 1, name: "가나다", phone: "01011112222" }), hit({ member_id: 2, name: "가나다", phone: "010-1111-2222" })];
    expect(rankCandidates(hits, { name: "가나다", phone: "010-1111-2222" }).auto).toBeNull();
  });
});

describe("미처리 신청 팝업", () => {
  const items = toItems(
    [{ id: 5, request_no: "D261008-0005", name: "가나다", year: 2025, member_name: null, is_returning: false, created_at: "2026-10-08T03:00:00Z" }],
    [{ id: 7, requester_name: "라마바", department: "교육부", content: "교재", amount: 12000, requested_at: "2026-10-07T03:00:00Z" }],
    [{ id: 2, year: 2027, amount: 500000, requester_name: "사아자", requested_at: "2026-10-09T03:00:00Z", department: { name: "찬양부" } }],
  );
  it("오래된 신청부터, 처리 화면 주소가 붙는다", () => {
    expect(items.map((i) => i.kind)).toEqual(["expense", "donation", "budget"]);
    expect(items[1].href).toBe("/receipt/issue?request=5&year=2025");
    expect(items[0].href).toBe("/requests/expense?open=7");
    expect(items[2].href).toBe("/requests/budget?open=2&year=2027");
    expect(items[1].sub).toContain("교인 미연결");
    expect(items[0].title).toBe("라마바 · 12,000원");
  });
  it("이미 보여준 신청은 팝업에서 뺀다", () => {
    expect(unseen(items, [itemKey(items[0])]).map((i) => i.id)).toEqual([5, 2]);
  });
});
