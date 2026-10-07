"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import YearSelect from "@/components/ui/YearSelect";
import { ExcelButton, btn, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { downloadXlsx } from "@/lib/excel";
import { fileName, thisYear } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/settings/db";
import { matchMember, type MemberRow } from "@/lib/settings/members";

type M = Pick<MemberRow, "id" | "full_name" | "title" | "district" | "zone">;
type R = { member_id: number; position: string | null };

// 설정 > 재직명단: 연도별 재직 교인과 직분
export default function OfficerRoster() {
  const sb = supabaseBrowser()!;
  const [year, setYear] = useState(thisYear());
  const [q, setQ] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const members = useDbQuery((sb) => fetchAll<M>(() => sb.from("v_member").select("id, full_name, title, district, zone").eq("active", true).order("name").order("id")), []);
  const roster = useDbQuery(async (sb) => must(await sb.from("officer_roster").select("member_id, position").eq("year", year)) as R[], [year]);

  const byId = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);
  const rows = useMemo(() => (roster.data ?? [])
    .map((r) => ({ ...r, m: byId.get(r.member_id) }))
    .sort((a, b) => (a.position ?? "").localeCompare(b.position ?? "", "ko") || (a.m?.full_name ?? "").localeCompare(b.m?.full_name ?? "", "ko")), [roster.data, byId]);
  const inRoster = new Set(rows.map((r) => r.member_id));
  const found = q.trim() ? (members.data ?? []).filter((m) => !inRoster.has(m.id) && matchMember(m, q)).slice(0, 8) : [];
  const positions = [...new Set([...(members.data ?? []).map((m) => m.title), ...rows.map((r) => r.position)].filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "ko"));
  const counts = rows.reduce<Record<string, number>>((o, r) => ({ ...o, [r.position || "(직분 없음)"]: (o[r.position || "(직분 없음)"] ?? 0) + 1 }), {});

  const act = async (fn: () => Promise<string | void>) => {
    setBusy(true); setNote(null);
    try { const t = await fn(); if (t) setNote({ ok: true, text: t }); roster.reload(); }
    catch (e) { setNote({ ok: false, text: dbError(e) }); }
    finally { setBusy(false); }
  };
  const add = (m: M) => { setQ(""); act(async () => { must(await sb.from("officer_roster").insert({ year, member_id: m.id, position: m.title })); }); };
  const setPosition = (r: R, position: string) => position !== (r.position ?? "") &&
    act(async () => { must(await sb.from("officer_roster").update({ position: position || null }).eq("year", year).eq("member_id", r.member_id).select("year")); });
  const remove = (r: R, name: string) => confirm(`${year}년 명단에서 ${name} 님을 뺄까요?`) &&
    act(async () => { must(await sb.from("officer_roster").delete().eq("year", year).eq("member_id", r.member_id)); });
  const copy = () => confirm(`${year - 1}년 명단을 ${year}년으로 복사할까요? 이미 있는 교인은 그대로 둬요.`) &&
    act(async () => `${year - 1}년 명단에서 ${must(await sb.rpc("copy_officer_roster", { p_from: year - 1, p_to: year }))}명을 복사했어요.`);
  const exportXlsx = () => downloadXlsx(fileName(`재직명단_${year}`, "xlsx"), [{
    name: `${year}년 재직명단`, widths: [14, 12, 10, 10],
    rows: [["이름", "직분", "교구", "구역"], ...rows.map((r) => [r.m?.full_name ?? `#${r.member_id}`, r.position, r.m?.district, r.m?.zone])],
  }]);

  return (
    <>
      <PageHeader actions={<>
        <YearSelect value={year} onChange={setYear} />
        <button className={btn} disabled={busy} onClick={copy}>{year - 1}년 명단 복사</button>
        <ExcelButton onClick={exportXlsx} disabled={!rows.length} />
      </>} />
      {(members.error || roster.error) && <Notice kind="error">불러오지 못했어요: {members.error ?? roster.error}</Notice>}
      {note && <Notice kind={note.ok ? "ok" : "error"}>{note.text}</Notice>}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="교인 검색해 추가" className={`${input} w-64`} />
          {found.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded border bg-surface shadow">
              {found.map((m) => (
                <li key={m.id}><button onClick={() => add(m)} className="w-full px-2 py-1 text-left hover:bg-surface-2">{m.full_name} <span className="text-xs text-muted">{m.title} {m.district}</span></button></li>
              ))}
            </ul>
          )}
        </div>
        <span className="text-muted">{year}년 {rows.length}명</span>
        {Object.entries(counts).map(([p, n]) => <span key={p} className="rounded bg-surface-2 px-2 py-0.5 text-xs text-label">{p} {n}</span>)}
      </div>

      <datalist id="positions">{positions.map((p) => <option key={p} value={p} />)}</datalist>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="px-3 py-2 text-left">이름</th><th className="text-left">직분({year}년)</th><th className="text-left">교인명단 직분</th><th className="text-left">교구/구역</th><th className="w-20" /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${year}-${r.member_id}-${r.position}`} className="border-t">
                <td className="px-3 py-1.5 text-heading">{r.m?.full_name ?? <span className="text-muted">비활성 교인 #{r.member_id}</span>}</td>
                <td><input list="positions" defaultValue={r.position ?? ""} onBlur={(e) => setPosition(r, e.target.value.trim())} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className={`${input} w-36 py-1`} /></td>
                <td className="text-label">{r.m?.title}</td>
                <td className="text-label">{[r.m?.district, r.m?.zone].filter(Boolean).join(" ")}</td>
                <td className="px-3 text-right text-xs"><button onClick={() => remove(r, r.m?.full_name ?? "")} className="text-danger">빼기</button></td>
              </tr>
            ))}
            {!roster.loading && !rows.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">{year}년 재직명단이 없어요. 교인을 검색해 추가하거나 전년도 명단을 복사해 주세요.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
