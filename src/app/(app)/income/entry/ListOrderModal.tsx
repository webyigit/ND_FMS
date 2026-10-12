"use client";
// 명단순서: 헌금명단 노출 순서(요구사항 2.1) 보기·설정. 지정 직분 순서 → 같은 직분은 교인 순서 → 개별 지정 → 나머지 가나다
import { useMemo, useState } from "react";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import Notice from "@/components/ui/Notice";
import type { Member } from "@/lib/demo";
import { dbError } from "@/lib/db/weekly";
import { addMember, frontRows, initOrder, moveMember, moveTitle, orderChanges, removeMember, type OrderState } from "@/lib/income/listOrder";
import { cleanTitles, DEFAULT_TITLE_ORDER } from "@/lib/offeringOrder";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useListNav } from "@/lib/listNav";

const arrow = "rounded border px-1.5 text-xs disabled:opacity-30";

export default function ListOrderModal({ members, titleOrder, demo, onSaved, onClose }: {
  members: Member[]; titleOrder: string[]; demo: boolean; onSaved: (text: string) => void; onClose: () => void;
}) {
  const [s, setS] = useState<OrderState>(() => initOrder(members, titleOrder));
  const [newTitle, setNewTitle] = useState("");
  const [query, setQuery] = useState("");
  const [addTitle, setAddTitle] = useState(titleOrder[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rows = useMemo(() => frontRows(s, members), [s, members]);
  const changes = useMemo(() => orderChanges(s, members), [s, members]);
  const titlesChanged = s.titles.join("\n") !== titleOrder.join("\n");
  const dirty = titlesChanged || changes.length > 0;
  const inFront = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const suggestions = useMemo(
    () => (query.trim().length >= 2 ? members.filter((m) => m.name.includes(query.trim()) && !inFront.has(m.id)).slice(0, 8) : []),
    [query, members, inFront],
  );
  const pick = (m: Member) => { setS((x) => addMember(x, m.id, addTitle)); setQuery(""); };
  const nav = useListNav(suggestions, pick, query);

  const addTitleRow = () => {
    const t = newTitle.trim();
    if (t && !s.titles.includes(t)) setS((x) => ({ ...x, titles: cleanTitles([...x.titles, t]) }));
    setNewTitle("");
  };
  const dropTitle = (t: string) => {
    const n = rows.filter((r) => r.title === t).length;
    if (n && !confirm(`'${t}' ${n}명은 가나다순으로 내려갑니다(직분은 그대로). 뺄까요?`)) return;
    setS((x) => ({ ...x, titles: x.titles.filter((y) => y !== t) }));
    if (addTitle === t) setAddTitle("");
  };
  const remove = (id: number, name: string, title: string) => {
    if (s.titles.includes(title) && !confirm(`${name}의 직분(${title})을 비우고 가나다순으로 내립니다. 뺄까요?`)) return;
    setS((x) => removeMember(x, id));
  };
  const resetDefault = () => {
    if (!confirm("직분 순서를 요구사항 기본값으로 되돌릴까요? (교인 순서는 그대로)")) return;
    setS((x) => ({ ...x, titles: [...DEFAULT_TITLE_ORDER] }));
  };
  const close = () => { if (!dirty || confirm("저장하지 않은 변경이 있어요. 닫을까요?")) onClose(); };

  const save = async () => {
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    try {
      const { error } = await sb.rpc("save_list_order", {
        p_titles: s.titles,
        p_members: changes.map((c) => ({ id: c.id, title: c.title, rank: c.rank })),
      });
      if (error) throw error;
      void sb.rpc("log_event", { p_action: "update", p_target: "명단순서" });
      onSaved(`명단순서를 저장했어요. (직분 ${s.titles.length}개, 앞 명단 ${rows.length}명)`);
    } catch (e) {
      setErr(`저장하지 못했어요: ${dbError(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={close}>
      <div className={`${card} flex max-h-[90vh] w-full max-w-4xl flex-col p-4`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="명단순서">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-heading">명단순서</h2>
          <div className="flex gap-2">
            <button onClick={close} className={btn}>닫기</button>
            {demo
              ? <button disabled className={btnPrimary} title="DB 연결 후 사용">저장</button>
              : <button onClick={save} disabled={busy || !dirty} className={btnPrimary}>{busy ? "저장 중…" : "저장"}</button>}
          </div>
        </div>
        <p className="mb-3 text-xs text-muted">
          헌금명단(수입입력·금주 수입내역·명단 추출)은 아래 순서로 나옵니다: 지정 직분(위에서부터) → 같은 직분 안에서는 정한 순서(임직순 등) → 개별 지정 → 나머지 성도 가나다순.
        </p>
        {err && <Notice kind="error">{err}</Notice>}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto md:grid-cols-[240px_1fr]">
          <section className="min-w-0">
            <div className="mb-2 flex items-center justify-between text-xs text-label">
              <span>① 직분 순서</span>
              <button onClick={resetDefault} className="text-primary">기본값</button>
            </div>
            <ol className="mb-2 rounded border text-sm">
              {s.titles.map((t, i) => (
                <li key={t} className="flex items-center gap-1 border-b px-2 py-1 last:border-0">
                  <span className="w-5 text-xs text-muted">{i + 1}</span>
                  <span className="flex-1">{t}</span>
                  <button className={arrow} disabled={i === 0} onClick={() => setS((x) => moveTitle(x, i, -1))} aria-label={`${t} 위로`}>▲</button>
                  <button className={arrow} disabled={i === s.titles.length - 1} onClick={() => setS((x) => moveTitle(x, i, 1))} aria-label={`${t} 아래로`}>▼</button>
                  <button className="px-1 text-xs text-danger" onClick={() => dropTitle(t)} aria-label={`${t} 빼기`}>✕</button>
                </li>
              ))}
              {!s.titles.length && <li className="px-2 py-1 text-xs text-muted">지정 직분이 없어요. 모두 가나다순입니다.</li>}
            </ol>
            <div className="flex gap-1">
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTitleRow()} placeholder="직분 추가(예: 협동목사)" className={`${input} flex-1`} />
              <button onClick={addTitleRow} className={btn}>추가</button>
            </div>
          </section>

          <section className="min-w-0">
            <div className="mb-2 text-xs text-label">② 앞에 오는 명단 ({rows.length}명) · ▲▼는 같은 직분 안에서 순서</div>
            <div className="relative mb-2 flex flex-wrap gap-1">
              <select value={addTitle} onChange={(e) => setAddTitle(e.target.value)} className={input} aria-label="추가할 직분">
                {s.titles.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="">개별 지정(직분 없이)</option>
              </select>
              <div className="relative min-w-[160px] flex-1">
                <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (!nav.onKeyDown(e) && e.key === "Enter" && suggestions[0]) pick(suggestions[0]); }}
                  placeholder="교인 이름 두 글자 이상 → 추가" className={`${input} w-full`} />
                {suggestions.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded border bg-surface text-sm text-heading shadow">
                    {suggestions.map((m, i) => (
                      <li key={m.id} {...nav.itemProps(i)}><button className="w-full px-2 py-1 text-left hover:bg-surface-2" onClick={() => pick(m)}>{m.name} {m.title && <span className="text-muted">{m.title}</span>}</button></li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {!rows.length && <div className="rounded border px-3 py-4 text-center text-sm text-muted">지정된 교인이 없어요. 위에서 직분을 고르고 이름으로 추가하세요. (교인명단에 직분을 넣어도 자동으로 들어옵니다)</div>}
            {!!rows.length && (
              <ol className="rounded border text-sm">
                {rows.map((r, i) => {
                  const first = i === 0 || rows[i - 1].group !== r.group;
                  const last = i === rows.length - 1 || rows[i + 1].group !== r.group;
                  return (
                    <li key={r.id}>
                      {first && <div className="border-b bg-surface-2 px-2 py-1 text-xs font-semibold text-label">{r.group < s.titles.length ? r.title : "개별 지정"}</div>}
                      <div className="flex items-center gap-1 border-b px-2 py-1">
                        <span className="w-7 text-xs text-muted">{i + 1}</span>
                        <span className="flex-1">{r.name}{r.group >= s.titles.length && r.title && <span className="text-xs text-muted"> · {r.title}</span>}</span>
                        <button className={arrow} disabled={first} onClick={() => setS((x) => moveMember(x, members, r.id, -1))} aria-label={`${r.name} 위로`}>▲</button>
                        <button className={arrow} disabled={last} onClick={() => setS((x) => moveMember(x, members, r.id, 1))} aria-label={`${r.name} 아래로`}>▼</button>
                        <button className="px-1 text-xs text-danger" onClick={() => remove(r.id, r.name, r.title)} aria-label={`${r.name} 빼기`}>빼기</button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="mt-2 text-xs text-muted">그 밖의 성도 {members.length - rows.length}명은 가나다순.</div>
          </section>
        </div>
      </div>
    </div>
  );
}
