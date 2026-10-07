import { describe, expect, it } from "vitest";
import { areaOf, canEnter, canUploadReceipt, homeFor } from "../work/access";
import { barWidth, editable, expenseFormProblems, groupItems, statusLabel, summarizeBudget, type ExpenseForm } from "../work/requests";
import { fromTodoRow, sortTodos } from "../todo";
import { forChannel, fromNoticeRow } from "../notice";
import { commentCounts, commentsOf, fromCommentRow, fromPostRow, listPosts } from "../board";
import { isPublicPath } from "../supabase/config";

describe("부서장 모바일·지출신청 접근", () => {
  it("영역 구분: /m/login 은 공개", () => {
    expect(areaOf("/m")).toBe("m");
    expect(areaOf("/m/expense/new")).toBe("m");
    expect(areaOf("/m/login")).toBeNull();
    expect(areaOf("/request")).toBe("request");
    expect(areaOf("/requests/expense")).toBeNull(); // 관리자 신청관리는 재정 화면
    expect(areaOf("/mission")).toBeNull();
    expect(isPublicPath("/m/login")).toBe(true);
    expect(isPublicPath("/m")).toBe(false);
    expect(isPublicPath("/request")).toBe(false);
    expect(isPublicPath("/notice")).toBe(true);
  });
  it("권한", () => {
    const u = (role: string, status = "approved") => ({ role, status });
    expect(canEnter("m", u("dept_head"))).toBe(true);
    expect(canEnter("m", u("admin"))).toBe(true);
    expect(canEnter("m", u("pastor"))).toBe(false);
    expect(canEnter("m", u("treasurer"))).toBe(false);
    expect(canEnter("m", u("dept_head", "pending"))).toBe(false);
    expect(canEnter("request", u("pastor"))).toBe(true);
    expect(canEnter("request", null)).toBe(false);
    expect(canUploadReceipt(u("pastor"))).toBe(true);
    expect(canUploadReceipt(u("viewer"))).toBe(false);
    expect(homeFor(u("dept_head"))).toBe("/m");
    expect(homeFor(u("pastor"))).toBe("/request");
    expect(homeFor(u("viewer"))).toBe("/pending");
    expect(homeFor(u("dept_head", "blocked"))).toBe("/pending");
  });
});

describe("신청", () => {
  const f: ExpenseForm = { departmentId: 1, content: "복사지", amount: 45000, usedAt: "2026-10-06", bank: "", accountNo: "", holder: "" };
  it("신청 전 확인", () => {
    expect(expenseFormProblems(f, { needDept: true, today: "2026-10-07" })).toEqual([]);
    expect(expenseFormProblems({ ...f, departmentId: null, content: " ", amount: 0 }, { needDept: true })).toEqual(["부서를 골라 주세요", "내용을 입력해 주세요", "금액을 입력해 주세요"]);
    expect(expenseFormProblems({ ...f, departmentId: null }, { needDept: false })).toEqual([]);
    expect(expenseFormProblems({ ...f, usedAt: "2026-10-08" }, { needDept: true, today: "2026-10-07" })).toEqual(["사용일이 오늘보다 뒤예요"]);
    expect(expenseFormProblems({ ...f, accountNo: "123-45" }, { needDept: true })).toEqual(["계좌번호를 확인해 주세요", "은행을 입력해 주세요"]);
    expect(expenseFormProblems({ ...f, bank: "가나은행", accountNo: "123-456-789012" }, { needDept: true })).toEqual([]);
  });
  it("상태", () => {
    expect(statusLabel("requested")).toBe("검토 중");
    expect(editable("requested")).toBe(true);
    expect(editable("approved")).toBe(false);
  });
  it("부서 예산 집계·집행률", () => {
    const rows = [
      { department_id: 7, department: "관리부", expense_item_id: 1, item: "인쇄비", budget: 1000000, spent: 250000 },
      { department_id: 7, department: "관리부", expense_item_id: 2, item: "사무용품비", budget: 0, spent: 30000 },
      { department_id: 10, department: "음악부", expense_item_id: 3, item: "찬양대", budget: 0, spent: 0 },
    ];
    const [a, b] = summarizeBudget(rows);
    expect(a).toMatchObject({ name: "관리부", budget: 1000000, spent: 280000, balance: 720000, rate: 0.28 });
    expect(a.items).toHaveLength(2);
    expect(b.rate).toBeNull();
    expect(barWidth(0.28)).toBe(28);
    expect(barWidth(1.5)).toBe(100);
    expect(barWidth(null)).toBe(0);
  });
  it("부서·항목 묶기", () => {
    const d = (id: number, sort: number) => ({ id, name: `부${id}`, sort_order: sort });
    const out = groupItems([
      { id: 3, name: "c", sort_order: 1, department: d(2, 2) },
      { id: 2, name: "b", sort_order: 2, department: d(1, 1) },
      { id: 1, name: "a", sort_order: 1, department: d(1, 1) },
      { id: 4, name: "x", sort_order: 1, department: null },
    ]);
    expect(out).toEqual([{ id: 1, name: "부1", items: [{ id: 1, name: "a" }, { id: 2, name: "b" }] }, { id: 2, name: "부2", items: [{ id: 3, name: "c" }] }]);
  });
});

describe("업무 DB 행 변환", () => {
  it("TODO", () => {
    const t = fromTodoRow({ id: "u1", due_date: "2026-10-09", content: "영수증 정리", done: false, created_at: "2026-10-07T01:00:00Z" });
    expect(t).toEqual({ id: "u1", date: "2026-10-09", text: "영수증 정리", done: false, createdAt: "2026-10-07T01:00:00Z" });
    expect(sortTodos([{ ...t, id: "d", done: true, date: "2026-10-01" }, t]).map((x) => x.id)).toEqual(["u1", "d"]);
  });
  it("공지: 게시일 우선, 채널", () => {
    const n = fromNoticeRow({ id: 5, channel: "member", title: "t", body: "b", pinned: null, published_at: "2026-10-07T00:00:00Z", created_at: "2026-10-06T00:00:00Z" });
    expect(n).toMatchObject({ id: "5", pinned: false, createdAt: "2026-10-07T00:00:00Z" });
    expect(forChannel([n], "member")).toHaveLength(1);
    expect(forChannel([n], "dept_head")).toHaveLength(0);
  });
  it("게시판: 작성자 이름", () => {
    const p = fromPostRow({ id: 1, title: "인수인계", body: "", author_name: "관리자", pinned: false, created_at: "2026-10-07", updated_at: null });
    expect(p).toEqual({ id: "1", title: "인수인계", body: "", author: "관리자", pinned: false, createdAt: "2026-10-07" });
    expect(listPosts([p], "관리자")).toHaveLength(1);
  });
});

describe("재정부게시판 댓글", () => {
  const row = { id: 3, post_id: 7, body: "확인", author_id: "u1", author_name: "재정부원", created_at: "2026-10-07T10:00:00Z", updated_at: null };
  it("DB 행을 화면 값으로", () => {
    expect(fromCommentRow(row)).toEqual({ id: "3", postId: "7", body: "확인", author: "재정부원", authorId: "u1", createdAt: "2026-10-07T10:00:00Z" });
    expect(fromCommentRow({ ...row, author_name: null, author_id: null, updated_at: "2026-10-07T11:00:00Z" }))
      .toMatchObject({ author: "", updatedAt: "2026-10-07T11:00:00Z" });
  });
  it("글별로 오래된 순, 개수", () => {
    const xs = [
      { id: "b", postId: "1", body: "둘", author: "", createdAt: "2026-10-07T12:00:00Z" },
      { id: "a", postId: "1", body: "하나", author: "", createdAt: "2026-10-07T09:00:00Z" },
      { id: "c", postId: "2", body: "다른 글", author: "", createdAt: "2026-10-07T10:00:00Z" },
    ];
    expect(commentsOf(xs, "1").map((c) => c.id)).toEqual(["a", "b"]);
    expect(commentsOf(xs, "9")).toEqual([]);
    const n = commentCounts(xs);
    expect([n.get("1"), n.get("2"), n.get("9")]).toEqual([2, 1, undefined]);
  });
});
