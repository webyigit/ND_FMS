"use client";
import { useState } from "react";
import { useDbQuery, must } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { supabaseBrowser } from "@/lib/supabase/client";
import { STATUS, editable, type RequestStatus } from "@/lib/work/requests";
import { won } from "@/lib/format";

type Row = { id: number; status: RequestStatus; department: string | null; item: string | null; content: string; amount: number; used_at: string | null;
  requested_at: string; review_note: string | null; drive_file_id: string | null; payee_id: number | null };

// 내 지출 신청 목록: 승인 전 건만 고치거나 지울 수 있다
export default function MyRequests({ editHref, reloadKey = 0 }: { editHref: string; reloadKey?: number }) {
  const sb = supabaseBrowser()!;
  const [err, setErr] = useState("");
  const q = useDbQuery(async (s) => {
    const { data: u } = await s.auth.getUser();
    return must(await s.from("v_expense_request").select("id, status, department, item, content, amount, used_at, requested_at, review_note, drive_file_id, payee_id")
      .eq("requested_by", u.user?.id ?? "").order("requested_at", { ascending: false }).limit(100)) as Row[];
  }, [reloadKey]);

  const del = async (r: Row) => {
    if (!confirm(`'${r.content}' 신청을 지울까요?`)) return;
    const { error } = await sb.from("expense_request").delete().eq("id", r.id);
    if (error) setErr(dbError(error)); else q.reload();
  };
  const total = (s: RequestStatus) => (q.data ?? []).filter((r) => r.status === s).reduce((a, r) => a + Number(r.amount), 0);

  return (
    <>
      {(q.error || err) && <div className="mb-3 rounded bg-danger-subtle px-3 py-2 text-sm text-danger">{q.error ?? err}</div>}
      {!!q.data?.length && (
        <div className="mb-2 flex gap-3 text-xs text-label">
          <span>검토 중 <b className="text-heading">{won(total("requested"))}</b></span>
          <span>승인 <b className="text-heading">{won(total("approved"))}</b></span>
        </div>
      )}
      <ul className="divide-y divide-line rounded-lg bg-surface text-sm shadow-card">
        {!q.data?.length && <li className="px-4 py-6 text-center text-muted">{q.loading ? "불러오는 중…" : "신청한 지출이 없어요"}</li>}
        {q.data?.map((r) => (
          <li key={r.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
              <span className="min-w-0 flex-1 truncate text-heading">{r.content}</span>
              <span className="shrink-0 font-semibold text-heading">{won(Number(r.amount))}</span>
            </div>
            <div className="mt-1 text-xs text-muted">
              신청 {r.requested_at.slice(0, 10)}{r.used_at ? ` · 사용 ${r.used_at}` : ""}{r.department ? ` · ${r.department}` : ""}{r.item ? `/${r.item}` : ""}
              {r.drive_file_id ? " · 사진 있음" : ""}{r.payee_id ? " · 계좌 등록" : ""}
            </div>
            {r.review_note && <div className={`mt-1 text-xs ${r.status === "rejected" ? "text-danger" : "text-label"}`}>재정부: {r.review_note}</div>}
            {editable(r.status) && (
              <div className="mt-1.5 flex gap-3 text-xs">
                <a href={`${editHref}?id=${r.id}`} className="text-primary">고치기</a>
                <button onClick={() => del(r)} className="text-danger">삭제</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
