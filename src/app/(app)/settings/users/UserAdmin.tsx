"use client";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { supabaseBrowser } from "@/lib/supabase/client";
import { dbError } from "@/lib/db/weekly";

type U = { id: string; name: string; phone: string | null; status: "pending" | "approved" | "blocked"; role: string; created_at: string; approved_at: string | null };
const ROLES: [string, string][] = [["admin", "관리자"], ["treasurer", "재정부"], ["viewer", "조회"], ["dept_head", "부서장"], ["pastor", "목회자"]];
const STATUS: Record<U["status"], [string, string]> = {
  pending: ["승인 대기", "bg-warning-subtle text-warning"],
  approved: ["승인", "bg-success-subtle text-success"],
  blocked: ["차단", "bg-danger-subtle text-danger"],
};

// 회원설정: 가입 승인, 권한, 접근 차단 (관리자만 다른 회원이 보인다)
export default function UserAdmin() {
  const sb = supabaseBrowser();
  const [users, setUsers] = useState<U[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [depts, setDepts] = useState<{ id: number; name: string }[]>([]);
  const [links, setLinks] = useState<{ user_id: string; department_id: number }[]>([]);

  const fetchAll = useCallback(() => {
    if (!sb) return;
    Promise.all([
      sb.auth.getUser(),
      sb.from("app_user").select("id, name, phone, status, role, created_at, approved_at").order("status").order("created_at", { ascending: false }),
      sb.from("department").select("id, name").order("sort_order"),
      sb.from("user_department").select("user_id, department_id"),
    ]).then(([{ data: auth }, { data, error }, d, l]) => {
      setMe(auth.user?.id ?? null);
      if (error) setErr(dbError(error)); else setUsers(data as U[]);
      setDepts((d.data ?? []) as { id: number; name: string }[]);
      setLinks((l.data ?? []) as { user_id: string; department_id: number }[]);
    });
  }, [sb]);
  useEffect(fetchAll, [fetchAll]);

  const update = async (u: U, patch: Partial<Pick<U, "status" | "role">>) => {
    if (!sb) return;
    setErr("");
    const { data, error } = await sb.from("app_user").update(patch).eq("id", u.id).select("id");
    if (error) return setErr(dbError(error));
    if (!data?.length) return setErr("관리자만 바꿀 수 있어요.");
    fetchAll();
  };

  // 부서장 ↔ 부서 연결: 부서장은 연결된 부서의 예산·지출만 본다
  const link = async (u: U, departmentId: number, on: boolean) => {
    if (!sb || !departmentId) return;
    setErr("");
    const { error } = on
      ? await sb.from("user_department").insert({ user_id: u.id, department_id: departmentId })
      : await sb.from("user_department").delete().eq("user_id", u.id).eq("department_id", departmentId);
    if (error) return setErr(dbError(error));
    fetchAll();
  };
  const deptName = (id: number) => depts.find((d) => d.id === id)?.name ?? id;

  if (!sb) return <><PageHeader /><div className="rounded bg-warning-subtle px-3 py-2 text-sm text-warning">데모 모드예요. DB를 연결하면 가입 승인·권한을 여기서 관리해요.</div></>;
  const pending = users.filter((u) => u.status === "pending").length;

  return (
    <>
      <PageHeader actions={pending > 0 && <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">승인 대기 {pending}명</span>} />
      {err && <div className="mb-3 rounded bg-danger-subtle px-3 py-2 text-sm text-danger">{err}</div>}
      <div className="overflow-x-auto rounded-lg bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="px-4 py-2 text-left">이름</th><th className="text-left">휴대폰</th><th>상태</th><th>권한</th><th className="text-left">맡은 부서(부서장)</th><th>가입일</th><th className="w-40" /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-2 text-heading">{u.name}{u.id === me && <span className="text-xs text-muted"> (나)</span>}</td>
                <td className="text-label">{u.phone ?? "-"}</td>
                <td className="text-center"><span className={`rounded px-2 py-0.5 text-xs ${STATUS[u.status][1]}`}>{STATUS[u.status][0]}</span></td>
                <td className="text-center">
                  <select value={u.role} onChange={(e) => update(u, { role: e.target.value })} className="rounded border px-2 py-1 text-sm">
                    {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td className="text-xs">
                  {(u.role === "dept_head" || links.some((l) => l.user_id === u.id)) && (
                    <div className="flex flex-wrap items-center gap-1">
                      {links.filter((l) => l.user_id === u.id).map((l) => (
                        <span key={l.department_id} className="rounded bg-primary-subtle px-2 py-0.5 text-primary">
                          {deptName(l.department_id)}
                          <button onClick={() => link(u, l.department_id, false)} aria-label="연결 해제" className="ml-1 text-muted">×</button>
                        </span>
                      ))}
                      {u.role === "dept_head" && (
                        <select value="" onChange={(e) => link(u, Number(e.target.value), true)} className="rounded border px-1 py-0.5 text-xs">
                          <option value="">+ 부서</option>
                          {depts.filter((d) => !links.some((l) => l.user_id === u.id && l.department_id === d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                </td>
                <td className="text-center text-xs text-label">{u.created_at.slice(0, 10)}</td>
                <td className="px-2 text-right text-xs">
                  {u.status !== "approved" && (
                    // 조회 권한으로는 재정 화면에 못 들어오므로 승인하면서 재정부로 올린다(권한은 옆에서 바꿀 수 있음)
                    <button onClick={() => update(u, u.role === "viewer" ? { status: "approved", role: "treasurer" } : { status: "approved" })} className="rounded bg-primary px-3 py-1 text-white">
                      {u.role === "viewer" ? "재정부로 승인" : "승인"}
                    </button>
                  )}{" "}
                  {u.status !== "blocked" && u.id !== me && <button onClick={() => confirm(`${u.name}님의 접근을 차단할까요?`) && update(u, { status: "blocked" })} className="rounded border px-3 py-1 text-danger">차단</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">재정 화면은 승인된 관리자·재정부 권한만 들어올 수 있어요. 처음 가입한 사람이 관리자가 돼요. 부서장은 부서장 페이지(/m)에서 연결된 부서의 예산·지출만 보고, 부서장·목회자는 지출신청하기(/request)를 쓸 수 있어요.</p>
    </>
  );
}
