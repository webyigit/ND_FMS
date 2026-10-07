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

  const fetchAll = useCallback(() => {
    if (!sb) return;
    Promise.all([
      sb.auth.getUser(),
      sb.from("app_user").select("id, name, phone, status, role, created_at, approved_at").order("status").order("created_at", { ascending: false }),
    ]).then(([{ data: auth }, { data, error }]) => {
      setMe(auth.user?.id ?? null);
      if (error) setErr(dbError(error)); else setUsers(data as U[]);
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

  if (!sb) return <><PageHeader /><div className="rounded bg-warning-subtle px-3 py-2 text-sm text-warning">데모 모드예요. DB를 연결하면 가입 승인·권한을 여기서 관리해요.</div></>;
  const pending = users.filter((u) => u.status === "pending").length;

  return (
    <>
      <PageHeader actions={pending > 0 && <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">승인 대기 {pending}명</span>} />
      {err && <div className="mb-3 rounded bg-danger-subtle px-3 py-2 text-sm text-danger">{err}</div>}
      <div className="overflow-x-auto rounded-lg bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="px-4 py-2 text-left">이름</th><th className="text-left">휴대폰</th><th>상태</th><th>권한</th><th>가입일</th><th className="w-40" /></tr>
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
      <p className="mt-3 text-xs text-muted">재정 화면은 승인된 관리자·재정부 권한만 들어올 수 있어요. 처음 가입한 사람이 관리자가 돼요.</p>
    </>
  );
}
