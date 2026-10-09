"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import Notice from "@/components/ui/Notice";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { supabaseBrowser } from "@/lib/supabase/client";
import { must, useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { fetchAll } from "@/lib/income/db";
import { thisYear, won } from "@/lib/format";
import {
  defaultInto, pairKey, period, searchMembers, suggestGroups, sumMembers, type Group, type MergeMember,
} from "@/lib/income/nameMerge";
import { td, tdNum, th } from "../_ui/sheet";

type MemberLite = Omit<MergeMember, "n" | "total" | "first_sunday" | "last_sunday">;
type Stat = { member_id: number; n: number; total: number; first_sunday: string; last_sunday: string };
type Merged = { id: number; member_id: number; member_name: string; member_title: string | null; into_id: number; into_name: string; merged_at: string; merged_by_name: string | null };
type NotSame = { a: number; b: number };

/** 이름합치기: 오기입으로 따로 등록된 같은 사람을 대표 이름 하나로 (전 기간 기준) */
export default function NameMergeTab({ onChanged }: { onChanged: () => void }) {
  const sb = supabaseBrowser()!;
  const members = useDbQuery((s) => fetchAll<MemberLite>((a, b) => s.from("v_member")
    .select("id, full_name, name_suffix, title, household_id, household_label, is_group, is_anonymous").eq("active", true).is("merged_into", null).order("id").range(a, b)), []);
  const stats = useDbQuery((s) => fetchAll<Stat>((a, b) => s.from("v_member_income_stat").select("*").order("member_id").range(a, b)), []);
  const merged = useDbQuery((s) => fetchAll<Merged>((a, b) => s.from("v_name_merge").select("*").order("merged_at", { ascending: false }).range(a, b)), []);
  const notSame = useDbQuery((s) => fetchAll<NotSame>((a, b) => s.from("member_not_same").select("a, b").range(a, b)), []);
  const reload = () => { members.reload(); stats.reload(); merged.reload(); notSame.reload(); onChanged(); };

  const all = useMemo((): MergeMember[] => {
    const st = new Map((stats.data ?? []).map((x) => [x.member_id, x]));
    return (members.data ?? []).map((m) => {
      const x = st.get(m.id);
      return { ...m, n: x?.n ?? 0, total: Number(x?.total ?? 0), first_sunday: x?.first_sunday ?? null, last_sunday: x?.last_sunday ?? null };
    });
  }, [members.data, stats.data]);
  const dismissed = useMemo(() => new Set((notSame.data ?? []).map((p) => pairKey(p.a, p.b))), [notSame.data]);
  const groups = useMemo(() => suggestGroups(all, dismissed), [all, dismissed]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; into?: number } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const merge = async (into: MergeMember, others: MergeMember[]) => {
    if (!others.length) return;
    if (!confirm(`${others.map((m) => m.full_name).join(", ")} → ${into.full_name}\n\n같은 사람으로 보고 대표 이름 '${into.full_name}'(으)로 합칠까요?\n헌금 원본 기록은 그대로이고, 개인별 합계와 기부금영수증은 '${into.full_name}'(으)로 잡혀요.\n합친 기록에서 언제든 되돌릴 수 있어요.`)) return;
    setBusy(true); setMsg(null);
    try {
      must(await sb.rpc("merge_members", { p_into: into.id, p_ids: others.map((m) => m.id) }));
      const s = sumMembers([into, ...others]);
      setMsg({ ok: true, text: `${others.map((m) => m.full_name).join(", ")} → ${into.full_name}(으)로 합쳤어요. 전체 ${s.n}건 ${won(s.total)}원.`, into: into.id });
      reload();
    } catch (e) { setMsg({ ok: false, text: `합치지 못했어요: ${dbError(e)}` }); } finally { setBusy(false); }
  };
  const dismiss = async (g: Group) => {
    if (!confirm(`${g.members.map((m) => m.full_name).join(", ")} 님은 서로 다른 사람인가요?\n이 묶음을 후보에서 뺄게요.`)) return;
    setBusy(true); setMsg(null);
    try {
      for (const p of g.pairs) must(await sb.rpc("mark_not_same", { p_a: p.a, p_b: p.b, p_on: true }));
      notSame.reload();
    } catch (e) { setMsg({ ok: false, text: `저장하지 못했어요: ${dbError(e)}` }); } finally { setBusy(false); }
  };
  const undo = async (r: Merged) => {
    if (!confirm(`${r.member_name} 님을 '${r.into_name}'에서 다시 나눌까요?\n헌금이 원래대로 '${r.member_name}' 이름으로 따로 계산돼요.`)) return;
    setBusy(true); setMsg(null);
    try {
      must(await sb.rpc("unmerge_member", { p_member: r.member_id }));
      setMsg({ ok: true, text: `${r.member_name} 님을 다시 나눴어요.` }); reload();
    } catch (e) { setMsg({ ok: false, text: `되돌리지 못했어요: ${dbError(e)}` }); } finally { setBusy(false); }
  };
  const restoreDismissed = async () => {
    if (!confirm(`'다른 사람'으로 뺀 ${dismissed.size}쌍을 다시 후보에 보일까요?`)) return;
    setBusy(true);
    try {
      for (const p of notSame.data ?? []) must(await sb.rpc("mark_not_same", { p_a: p.a, p_b: p.b, p_on: false }));
      notSame.reload();
    } catch (e) { setMsg({ ok: false, text: `저장하지 못했어요: ${dbError(e)}` }); } finally { setBusy(false); }
  };

  const error = members.error ?? stats.error ?? merged.error ?? notSame.error;
  const loading = members.loading || stats.loading;
  const shown = showAll ? groups : groups.slice(0, 20);

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-muted">오기입으로 따로 생긴 같은 사람의 이름(예: 홍길동 ↔ 홍길둥)을 대표 이름 하나로 합쳐요. 헌금 원본은 그대로 두고, 합계·기부금영수증만 대표 이름으로 모아요. 다른 사람끼리 묶는 건 [가족단위] 탭에서 해요.</p>
      {error && <Notice kind="error">불러오지 못했어요: {error}</Notice>}
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}{msg.ok && msg.into && <Link href={`/receipt/issue?member=${msg.into}&year=${thisYear()}`} className="ml-2 underline">기부금영수증 발행하기</Link>}</Notice>}

      <ManualMerge all={all} busy={busy} onMerge={merge} />

      <div className={`${card} p-4`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-heading">비슷한 이름 후보 {loading ? "" : `${groups.length}묶음`}</h2>
          <span className="text-xs text-muted">한 글자만 다르거나 빠진 이름끼리 (헌금 기록이 있는 교인, 전 기간)</span>
          {dismissed.size > 0 && <button disabled={busy} onClick={restoreDismissed} className="ml-auto text-xs text-label underline">다른 사람으로 뺀 {dismissed.size}쌍 다시 보기</button>}
        </div>
        {loading ? <p className="py-4 text-muted">불러오는 중…</p> : !groups.length ? <p className="py-4 text-center text-muted">비슷한 이름 후보가 없어요.</p> : (
          <div className="space-y-3">
            {shown.map((g) => <GroupCard key={g.members.map((m) => m.id).join("-")} g={g} busy={busy} onMerge={merge} onDismiss={() => dismiss(g)} />)}
            {groups.length > shown.length && <button onClick={() => setShowAll(true)} className={btn}>나머지 {groups.length - shown.length}묶음 더 보기</button>}
          </div>
        )}
      </div>

      <div className={`${card} p-4`}>
        <h2 className="mb-2 font-semibold text-heading">합친 기록 {merged.data ? `${merged.data.length}건` : ""}</h2>
        {!merged.data?.length ? <p className="py-2 text-muted">아직 합친 이름이 없어요.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr><th className={th}>합쳐진 이름</th><th className={th}>대표 이름</th><th className={th}>합친 날</th><th className={th}>처리</th><th className={`${th} no-print`} /></tr></thead>
              <tbody>
                {merged.data.map((r) => (
                  <tr key={r.id}>
                    <td className={td}>{r.member_name} {r.member_title && <span className="text-xs text-muted">{r.member_title}</span>}</td>
                    <td className={td}><b>{r.into_name}</b></td>
                    <td className={td}>{r.merged_at.slice(0, 10)}</td>
                    <td className={`${td} text-xs text-muted`}>{r.merged_by_name}</td>
                    <td className={`${td} no-print text-center`}><button disabled={busy} onClick={() => undo(r)} className="text-xs text-danger">되돌리기</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** 묶음 표: 체크한 사람을 대표(라디오)로 합친다 */
function MergeTable({ ms, sel, into, onToggle, onInto, why }: {
  ms: MergeMember[]; sel: Set<number>; into: number | null; onToggle: (id: number) => void; onInto: (id: number) => void; why?: (m: MergeMember) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead><tr>
          <th className={`${th} w-14 whitespace-nowrap`}>합침</th><th className={`${th} w-14 whitespace-nowrap`}>대표</th><th className={th}>이름</th><th className={th}>직분</th><th className={th}>가족</th>
          <th className={th}>헌금 기간</th><th className={th}>건수</th><th className={th}>합계</th>{why && <th className={th}>비슷한 점</th>}
        </tr></thead>
        <tbody>
          {ms.map((m) => (
            <tr key={m.id} className={m.id === into ? "bg-primary-subtle/50" : ""}>
              <td className={`${td} text-center`}><input type="checkbox" aria-label={`${m.full_name} 합침`} checked={sel.has(m.id)} onChange={() => onToggle(m.id)} /></td>
              <td className={`${td} text-center`}><input type="radio" aria-label={`${m.full_name} 대표`} checked={m.id === into} disabled={!sel.has(m.id)} onChange={() => onInto(m.id)} /></td>
              <td className={td}>{m.full_name}{m.id === into && <span className="ml-1 rounded bg-info-subtle px-1 text-xs text-info">대표</span>}</td>
              <td className={td}>{m.title}</td>
              <td className={`${td} text-xs`}>{m.household_label}</td>
              <td className={`${td} text-xs`}>{period(m)}</td>
              <td className={tdNum}>{m.n}</td>
              <td className={tdNum}>{won(m.total)}</td>
              {why && <td className={`${td} text-xs text-muted`}>{why(m)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useSelection(ms: MergeMember[]) {
  const [sel, setSel] = useState<Set<number>>(() => new Set(ms.map((m) => m.id)));
  const [into, setInto] = useState<number | null>(null);
  const picked = ms.filter((m) => sel.has(m.id));
  const intoId = into != null && sel.has(into) ? into : defaultInto(picked);
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return { sel, picked, intoId, setInto, toggle };
}

function GroupCard({ g, busy, onMerge, onDismiss }: { g: Group; busy: boolean; onMerge: (into: MergeMember, others: MergeMember[]) => void; onDismiss: () => void }) {
  const { sel, picked, intoId, setInto, toggle } = useSelection(g.members);
  const intoM = picked.find((m) => m.id === intoId);
  const why = (m: MergeMember) => g.pairs.filter((p) => p.a === m.id || p.b === m.id)
    .map((p) => { const o = g.members.find((x) => x.id === (p.a === m.id ? p.b : p.a)); return `${o?.full_name}: ${p.sim.why}`; }).join(" / ");
  const sameFamily = new Set(g.members.map((m) => m.household_id).filter((h) => h != null)).size < g.members.filter((m) => m.household_id != null).length;
  return (
    <div className="rounded border p-3">
      <MergeTable ms={g.members} sel={sel} into={intoId} onToggle={toggle} onInto={setInto} why={why} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {sameFamily && <span className="text-xs text-warning">같은 가족에 있는 이름이 있어요. 가족(다른 사람)인지 확인해 주세요.</span>}
        <button disabled={busy || !intoM || picked.length < 2} onClick={() => intoM && onMerge(intoM, picked.filter((m) => m.id !== intoM.id))} className={`${btnPrimary} ml-auto`}>
          {intoM ? `'${intoM.full_name}'(으)로 합치기` : "대표를 고르세요"}
        </button>
        <button disabled={busy} onClick={onDismiss} className={btn}>다른 사람이에요</button>
      </div>
    </div>
  );
}

/** 직접 합치기: 이름으로 찾아 담고 대표를 고른다 */
function ManualMerge({ all, busy, onMerge }: { all: MergeMember[]; busy: boolean; onMerge: (into: MergeMember, others: MergeMember[]) => void }) {
  const [ids, setIds] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [off, setOff] = useState<Set<number>>(new Set());
  const [into, setInto] = useState<number | null>(null);
  const list = ids.map((id) => all.find((m) => m.id === id)).filter((m): m is MergeMember => !!m);
  const sel = new Set(list.filter((m) => !off.has(m.id)).map((m) => m.id));
  const pickedNow = list.filter((m) => sel.has(m.id));
  const intoNow = into != null && sel.has(into) ? into : defaultInto(pickedNow);
  const intoM = pickedNow.find((m) => m.id === intoNow);
  const hits = useMemo(() => searchMembers(all, q, new Set(ids)), [all, q, ids]);
  const add = (m: MergeMember) => { setIds((x) => [...x, m.id]); setQ(""); };
  const toggle = (id: number) => setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clear = () => { setIds([]); setOff(new Set()); setInto(null); };
  const sum = sumMembers(pickedNow);
  return (
    <div className={`${card} p-4`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-heading">직접 합치기</h2>
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름으로 찾아 담기" className={`${input} w-56`} />
          {hits.length > 0 && (
            <ul className="absolute z-10 mt-1 w-80 rounded border bg-surface shadow">
              {hits.map((m) => (
                <li key={m.id}><button onClick={() => add(m)} className="flex w-full justify-between px-2 py-1 text-left hover:bg-surface-2">
                  <span>{m.full_name} <span className="text-xs text-muted">{m.title} {m.household_label && `· ${m.household_label}`}</span></span>
                  <span className="text-xs text-label">{m.n}건</span>
                </button></li>
              ))}
            </ul>
          )}
        </div>
        {list.length > 0 && <button onClick={clear} className={`${btn} ml-auto`}>비우기</button>}
      </div>
      {!list.length ? <p className="py-2 text-muted">합칠 이름을 2개 이상 담고, 대표 이름을 고르세요.</p> : <>
        <MergeTable ms={list} sel={sel} into={intoNow} onToggle={toggle} onInto={setInto} />
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-label">합치면 {sum.n}건 {won(sum.total)}원</span>
          <button disabled={busy || !intoM || pickedNow.length < 2} onClick={() => intoM && onMerge(intoM, pickedNow.filter((m) => m.id !== intoM.id))} className={`${btnPrimary} ml-auto`}>
            {intoM ? `'${intoM.full_name}'(으)로 합치기` : "대표를 고르세요"}
          </button>
        </div>
      </>}
    </div>
  );
}
