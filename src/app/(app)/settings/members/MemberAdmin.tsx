"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import { ExcelButton, btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { downloadXlsx } from "@/lib/excel";
import { fileName } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/settings/db";
import { exportRows, matchMember, sortMembers, type MemberRow } from "@/lib/settings/members";
import MemberForm from "./MemberForm";
import MemberImport from "./MemberImport";

type Status = "active" | "inactive" | "all";
const PAGE = 100;

// 설정 > 교인명단: 목록·검색, 추가/수정/비활성, 가족·별칭, 엑셀 내려받기·일괄 등록
export default function MemberAdmin() {
  const sb = supabaseBrowser()!;
  const q = useDbQuery((sb) => fetchAll<MemberRow>(() => sb.from("v_member").select("*").order("name").order("id")), []);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [order, setOrder] = useState<"name" | "rank">("name");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<MemberRow | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const list = useMemo(() => {
    const xs = all.filter((m) => (status === "all" || m.active === (status === "active")) && matchMember(m, query));
    return order === "rank" ? sortMembers(xs) : xs;
  }, [all, status, query, order]);

  const exportXlsx = () =>
    downloadXlsx(fileName("교인명단", "xlsx"), [{ name: "교인명단", rows: exportRows(list), widths: [12, 10, 8, 8, 12, 10, 15, 30, 16, 14, 6, 8, 6, 6, 10, 8] }])
      .then(() => sb.rpc("log_event", { p_action: "download", p_target: "교인명단" }));

  const done = (text: string) => { setNote({ ok: true, text }); q.reload(); };
  // 새로 추가한 교인은 목록을 다시 읽은 뒤에 열린다
  const current = editing === "new" ? "new" : editing ? all.find((m) => m.id === editing.id) ?? null : null;

  return (
    <>
      <PageHeader actions={<>
        <button className={btn} onClick={() => setImporting((v) => !v)}>엑셀 일괄 등록</button>
        <ExcelButton onClick={exportXlsx} disabled={!list.length} />
        <button className={btnPrimary} onClick={() => { setEditing("new"); setNote(null); }}>새 교인</button>
      </>} />
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      {note && <Notice kind={note.ok ? "ok" : "error"}>{note.text}</Notice>}
      {importing && <MemberImport existing={all.map((m) => m.full_name)} onDone={(t) => { setImporting(false); done(t); }} />}

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="이름·직분·교구·구역 검색" className={`${input} w-64`} />
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={input}>
              <option value="active">사용 중</option><option value="inactive">비활성</option><option value="all">전체</option>
            </select>
            <select value={order} onChange={(e) => setOrder(e.target.value as "name" | "rank")} className={input}>
              <option value="name">가나다순</option><option value="rank">헌금명단 순서</option>
            </select>
            <span className="text-sm text-muted">{q.loading ? "불러오는 중…" : `${list.length}명`}</span>
          </div>
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-label">
                <tr>
                  <th className="px-3 py-2 text-left">이름</th><th className="text-left">직분</th><th className="text-left">교구/구역</th>
                  <th className="text-left">봉사</th><th className="text-left">휴대폰</th><th className="text-left">주민번호</th>
                  <th className="text-left">가족</th><th>순서</th><th className="px-3 text-left">구분</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, limit).map((m) => (
                  <tr key={m.id} onClick={() => { setEditing(m); setNote(null); }}
                    className={`cursor-pointer border-t hover:bg-surface-2 ${current !== "new" && current?.id === m.id ? "bg-primary-subtle" : ""} ${m.active ? "" : "text-muted"}`}>
                    <td className="px-3 py-1.5 text-heading">{m.full_name}</td>
                    <td>{m.title}</td>
                    <td className="text-label">{[m.district, m.zone].filter(Boolean).join(" ")}</td>
                    <td className="text-label">{[m.service_dept, m.service_role].filter(Boolean).join(" ")}</td>
                    <td className="whitespace-nowrap text-label">{m.phone}</td>
                    <td className="whitespace-nowrap text-label">{m.rrn_mask}</td>
                    <td className="text-label">{m.household_label}{m.is_household_head && <span className="ml-1 rounded bg-info-subtle px-1 text-xs text-info">세대주</span>}</td>
                    <td className="text-center text-label">{m.display_rank}</td>
                    <td className="px-3 text-xs">
                      {m.is_group && <span className="mr-1 rounded bg-surface-2 px-1">단체</span>}
                      {m.is_anonymous && <span className="mr-1 rounded bg-surface-2 px-1">무명</span>}
                      {m.exclude_from_receipt && <span className="mr-1 rounded bg-warning-subtle px-1 text-warning">영수증 제외</span>}
                      {m.merged_into ? <span className="rounded bg-surface-2 px-1">→ {m.merged_into_name}에 합쳐짐</span> : !m.active && <span className="rounded bg-danger-subtle px-1 text-danger">비활성</span>}
                    </td>
                  </tr>
                ))}
                {!q.loading && !list.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted">교인이 없어요.</td></tr>}
              </tbody>
            </table>
          </div>
          {list.length > limit && <button className={`${btn} mt-3`} onClick={() => setLimit((n) => n + PAGE)}>더 보기 ({list.length - limit}명 남음)</button>}
        </div>

        {current && (
          <MemberForm key={current === "new" ? "new" : current.id} member={current === "new" ? null : current} members={all}
            onClose={() => setEditing(null)}
            onSaved={(text, id) => { done(text); if (id) setEditing((e) => (e === "new" ? ({ id } as MemberRow) : e)); }}
            onError={(e) => setNote({ ok: false, text: dbError(e) })} />
        )}
      </div>
    </>
  );
}
