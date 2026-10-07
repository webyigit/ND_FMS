"use client";
import { Fragment, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import { btn, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { localDate } from "@/lib/format";
import { amIAdmin } from "@/lib/settings/db";
import { ACTIONS, TABLES, actionLabel, dayRange, diffRows, secretChanged, tableLabel } from "@/lib/settings/audit";

type Log = { id: number; user_id: string | null; action: string | null; target_table: string | null; target_id: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null; at: string };
type Filter = { from: string; to: string; user: string; action: string; table: string };
const SIZE = 50;
const weekAgo = () => { const d = new Date(); d.setDate(d.getDate() - 7); return localDate(d); };

// 설정 > 시스템 사용내역: 화면 접속·데이터 변경 기록 (관리자만, RLS로 막힘)
export default function AuditLog() {
  const [draft, setDraft] = useState<Filter>(() => ({ from: weekAgo(), to: localDate(), user: "", action: "", table: "" }));
  const [f, setF] = useState(draft);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  const base = useDbQuery(async (sb) => {
    const admin = await amIAdmin(sb);
    const users = admin ? (must(await sb.from("app_user").select("id, name").order("name")) as { id: string; name: string }[]) : [];
    return { admin, users };
  }, []);
  const logs = useDbQuery(async (sb) => {
    let qb = sb.from("audit_log").select("id, user_id, action, target_table, target_id, before, after, at", { count: "exact" });
    const r = dayRange(f.from, f.to);
    if (r.gte) qb = qb.gte("at", r.gte);
    if (r.lt) qb = qb.lt("at", r.lt);
    if (f.user) qb = qb.eq("user_id", f.user);
    if (f.action) qb = qb.eq("action", f.action);
    if (f.table) qb = qb.eq("target_table", f.table);
    const { data, error, count } = await qb.order("at", { ascending: false }).order("id", { ascending: false }).range(page * SIZE, page * SIZE + SIZE - 1);
    if (error) throw error;
    return { rows: data as Log[], count: count ?? 0 };
  }, [f, page]);

  const userName = (id: string | null) => (id ? base.data?.users.find((u) => u.id === id)?.name ?? id.slice(0, 8) : "-");
  const pages = Math.max(1, Math.ceil((logs.data?.count ?? 0) / SIZE));
  const set = (k: keyof Filter, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const apply = () => { setF(draft); setPage(0); setOpen(null); };

  if (base.data && !base.data.admin) return <><PageHeader /><Notice kind="warn">시스템 사용내역은 관리자만 볼 수 있어요.</Notice></>;

  return (
    <>
      <PageHeader />
      {(base.error || logs.error) && <Notice kind="error">불러오지 못했어요: {base.error ?? logs.error}</Notice>}
      <div className={`${card} mb-4 flex flex-wrap items-end gap-2 p-4 text-sm`}>
        <label className="text-xs text-label">시작일<input type="date" value={draft.from} onChange={(e) => set("from", e.target.value)} className={`${input} mt-1 block`} /></label>
        <label className="text-xs text-label">종료일<input type="date" value={draft.to} onChange={(e) => set("to", e.target.value)} className={`${input} mt-1 block`} /></label>
        <label className="text-xs text-label">사용자
          <select value={draft.user} onChange={(e) => set("user", e.target.value)} className={`${input} mt-1 block`}>
            <option value="">전체</option>{base.data?.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-label">동작
          <select value={draft.action} onChange={(e) => set("action", e.target.value)} className={`${input} mt-1 block`}>
            <option value="">전체</option>{Object.entries(ACTIONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs text-label">대상
          <select value={draft.table} onChange={(e) => set("table", e.target.value)} className={`${input} mt-1 block`}>
            <option value="">전체</option>{Object.entries(TABLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <button onClick={apply} className="rounded bg-primary px-4 py-1.5 text-white">조회</button>
        <span className="ml-auto text-muted">{logs.loading ? "불러오는 중…" : `${(logs.data?.count ?? 0).toLocaleString("ko-KR")}건`}</span>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="px-3 py-2 text-left">시각</th><th className="text-left">사용자</th><th className="text-left">동작</th><th className="text-left">대상</th><th className="text-left">내용</th><th className="w-16" /></tr>
          </thead>
          <tbody>
            {logs.data?.rows.map((l) => {
              const hasDiff = !!(l.before || l.after);
              const changed = hasDiff ? diffRows(l.before, l.after).filter((d) => d.changed).map((d) => d.key) : [];
              const secret = secretChanged(l.after);
              return (
                <Fragment key={l.id}>
                  <tr className="border-t">
                    <td className="whitespace-nowrap px-3 py-1.5 text-label">{new Date(l.at).toLocaleString("ko-KR", { hour12: false })}</td>
                    <td>{userName(l.user_id)}</td>
                    <td>{actionLabel(l.action)}</td>
                    <td>{tableLabel(l.target_table)}{l.target_table !== "ui" && l.target_id && <span className="text-xs text-muted"> #{l.target_id}</span>}</td>
                    <td className="max-w-md truncate text-label">
                      {l.target_table === "ui" ? l.target_id : [...changed, ...secret.map((k) => `${k}(새로 입력)`)].join(", ")}
                    </td>
                    <td className="px-3 text-right text-xs">{hasDiff && <button onClick={() => setOpen(open === l.id ? null : l.id)} className="text-primary">{open === l.id ? "접기" : "펼치기"}</button>}</td>
                  </tr>
                  {open === l.id && (
                    <tr className="bg-surface-2">
                      <td colSpan={6} className="px-3 py-2">
                        <table className="w-full text-xs">
                          <thead className="text-label"><tr><th className="w-40 text-left">칸</th><th className="text-left">변경 전</th><th className="text-left">변경 후</th></tr></thead>
                          <tbody>
                            {diffRows(l.before, l.after).map((d) => (
                              <tr key={d.key} className={d.changed ? "font-semibold text-heading" : "text-label"}>
                                <td className="py-0.5">{d.key}</td><td className="break-all">{d.before}</td><td className="break-all">{d.after}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-1 text-xs text-muted">주민번호·계좌번호 같은 암호화 칸은 표시하지 않아요.</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!logs.loading && !logs.data?.rows.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">기록이 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-sm">
        <button className={btn} disabled={page === 0} onClick={() => { setPage(page - 1); setOpen(null); }}>이전</button>
        <span className="text-label">{page + 1} / {pages}</span>
        <button className={btn} disabled={page + 1 >= pages} onClick={() => { setPage(page + 1); setOpen(null); }}>다음</button>
      </div>
    </>
  );
}
