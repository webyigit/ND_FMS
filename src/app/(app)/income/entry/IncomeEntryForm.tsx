"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { currentSunday, type Member } from "@/lib/demo";
import { sortForList } from "@/lib/offeringOrder";
import { useRefData, type RefData } from "@/lib/db/refData";
import { dbError, incomeSig, loadIncome, saveIncome, type IncomeEntry as Entry } from "@/lib/db/weekly";
import { supabaseBrowser } from "@/lib/supabase/client";
import { enqueue, getWeekCache, setWeekCache, syncNow } from "@/lib/offline/sync";
import { isNetworkError } from "@/lib/offline/logic";

const KEY_TYPE = "ndfms.income.type"; // 헌금구분은 바꾸기 전까지 유지
const KEY_DRAFT = "ndfms.income.draft"; // 완료 전까지 계속 입력(임시저장)
const KEY_META = "ndfms.income.draft.meta"; // {sunday, savedSig}: 어느 주일 것이고 DB와 같은지
const won = (n: number) => n.toLocaleString("ko-KR");
const load = <T,>(k: string, d: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
};
type Meta = { sunday: string; savedSig: string | null };

export default function IncomeEntryForm() {
  const { ref, error } = useRefData();
  if (error) return <><PageHeader /><div className="rounded bg-danger-subtle px-3 py-2 text-sm text-danger">기준정보를 불러오지 못했어요: {error}</div></>;
  if (!ref) return <><PageHeader /><div className="text-sm text-muted">불러오는 중…</div></>;
  if (!ref.offeringTypes.length) return <><PageHeader /><div className="rounded bg-warning-subtle px-3 py-2 text-sm text-warning">헌금구분이 없어요. 설정 &gt; 헌금구분을 먼저 채워 주세요(supabase/seed.sql).</div></>;
  return <Form ref_={ref} />;
}

function Form({ ref_ }: { ref_: RefData }) {
  const { offeringTypes: OFFERING_TYPES, members: MEMBERS, demo } = ref_;
  const sb = supabaseBrowser();
  const [meta0] = useState(() => load<Meta | null>(KEY_META, null));
  const [sunday, setSunday] = useState(() => (!demo && meta0?.sunday) || currentSunday());
  const [typeId, setTypeId] = useState(() => {
    const t = load(KEY_TYPE, OFFERING_TYPES[0]?.id ?? 1);
    return OFFERING_TYPES.some((o) => o.id === t) ? t : OFFERING_TYPES[0]?.id ?? 1;
  });
  const [channel, setChannel] = useState<"cash" | "online">("cash");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Member | null>(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [entries, setEntries] = useState<Entry[]>(() => load<Entry[]>(KEY_DRAFT, []));
  const [savedSig, setSavedSig] = useState<string | null>(() => meta0?.savedSig ?? null);
  // 처음 열 때: 저장 안 한 입력이 있으면 이어서, 없으면 DB에서 불러온다
  const [resumed] = useState(() => !demo && entries.length > 0 && meta0?.savedSig !== incomeSig(entries));
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(!demo && !resumed);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(resumed ? { ok: true, text: "저장하지 않은 입력을 이어서 보여드려요." } : null);
  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const dirty = !demo && savedSig !== incomeSig(entries);

  useEffect(() => { try { localStorage.setItem(KEY_TYPE, JSON.stringify(typeId)); } catch {} }, [typeId]);
  useEffect(() => { try { localStorage.setItem(KEY_DRAFT, JSON.stringify(entries)); } catch {} }, [entries]);
  useEffect(() => { try { localStorage.setItem(KEY_META, JSON.stringify({ sunday, savedSig })); } catch {} }, [sunday, savedSig]);

  // DB에 저장된 그 주일 입력을 불러온다. 오프라인이면 기기에 저장된(마지막으로 받았거나 올리기 대기 중인) 것을 보여준다
  const pull = useCallback((day: string) => {
    if (!sb) return;
    const onLoaded = (xs: Entry[]) => {
      setEntries(xs); setSavedSig(incomeSig(xs));
      void setWeekCache("income", day, { rows: xs, serverSig: incomeSig(xs) });
    };
    const onFailed = async (e: unknown) => {
      if (!isNetworkError(e)) return setNote({ ok: false, text: `불러오지 못했어요: ${dbError(e)}` });
      const hit = await getWeekCache("income", day);
      const xs = (hit?.rows as Entry[] | undefined) ?? [];
      setEntries(xs); setSavedSig(incomeSig(xs));
      setNote({ ok: true, text: hit ? "오프라인이에요. 기기에 저장된 이 주일 입력을 보여드려요." : "오프라인이에요. 이 주일은 기기에 저장된 입력이 없어 새로 입력해요. 저장하면 연결될 때 올립니다." });
    };
    // 올리기 대기 중인 입력이 있으면 먼저 올리고 읽는다
    return syncNow().then(() => loadIncome(sb, day)).then(onLoaded, onFailed).finally(() => setBusy(false));
  }, [sb]);
  const fetchWeek = (day: string) => { setBusy(true); setNote(null); pull(day); };

  useEffect(() => {
    if (!demo && !resumed) pull(sunday);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeSunday = (day: string) => {
    if (!day) return;
    if (dirty && !confirm("저장하지 않은 입력이 있어요. 버리고 다른 주일로 갈까요?")) return;
    setSunday(day); reset();
    if (!demo) fetchWeek(day);
  };

  // 오프라인(또는 전송 실패)이면 기기 대기열에 넣는다. 기준 서명은 마지막으로 서버에서 받은 내용
  const queue = async () => {
    await enqueue("income", sunday, entries, (await getWeekCache("income", sunday))?.serverSig ?? null);
    setSavedSig(incomeSig(entries));
    setNote({ ok: true, text: `오프라인이어서 ${sunday} 주일 수입 ${entries.length}건을 이 기기에 저장했어요. 연결되면 자동으로 올립니다.` });
  };
  const save = async () => {
    if (!sb) return;
    setBusy(true); setNote(null);
    try {
      if (!navigator.onLine) return await queue();
      const n = await saveIncome(sb, sunday, entries);
      setSavedSig(incomeSig(entries));
      setNote({ ok: true, text: `${sunday} 주일 수입 ${n}건을 저장했어요.` });
      pull(sunday); // 새 행의 DB id를 받아 다음 저장 때 같은 행을 고치게
    } catch (e) {
      if (isNetworkError(e)) await queue();
      else setNote({ ok: false, text: `저장하지 못했어요: ${dbError(e)}` });
    } finally { setBusy(false); }
  };

  const type = OFFERING_TYPES.find((t) => t.id === typeId) ?? OFFERING_TYPES[0];
  const unit = type.unit ?? 1;
  const suggestions = useMemo(
    () => (query.length >= 2 && !picked ? MEMBERS.filter((m) => m.name.includes(query)).slice(0, 8) : []),
    [query, picked, MEMBERS],
  );

  const reset = () => { setQuery(""); setPicked(null); setAmount(""); setMemo(""); setEditId(null); };

  const submit = () => {
    const n = Number(amount.replace(/,/g, "")) * unit;
    if (!n) return amountRef.current?.focus();
    if (!type.totalOnly && !picked && !query.trim()) return nameRef.current?.focus();
    const e: Entry = {
      id: editId ?? crypto.randomUUID(), typeId, channel,
      memberId: type.totalOnly ? null : picked?.id ?? null,
      name: type.totalOnly ? "(총액)" : picked?.name ?? query.trim(), // 미등록 이름·가족 묶음은 그대로 저장
      amount: n, memo,
    };
    setEntries((xs) => (editId ? xs.map((x) => (x.id === editId ? e : x)) : [...xs, e]));
    reset();
    (type.totalOnly ? amountRef : nameRef).current?.focus();
  };

  const edit = (e: Entry) => {
    setEditId(e.id); setTypeId(e.typeId); setChannel(e.channel);
    setPicked(MEMBERS.find((m) => m.id === e.memberId) ?? null); setQuery(e.name);
    setAmount(String(e.amount / (OFFERING_TYPES.find((t) => t.id === e.typeId)?.unit ?? 1))); setMemo(e.memo);
  };

  const byType = OFFERING_TYPES.map((t) => {
    const rows = entries.filter((e) => e.typeId === t.id);
    const ranked = sortForList(rows.map((r) => ({ ...r, displayRank: MEMBERS.find((m) => m.id === r.memberId)?.displayRank })));
    return { t, rows: ranked, total: rows.reduce((s, r) => s + r.amount, 0) };
  }).filter((g) => g.rows.length);
  const grand = entries.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <PageHeader actions={demo
        ? <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">데모 데이터 · DB 연결 전 브라우저에만 임시저장</span>
        : dirty && <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">저장 안 됨</span>} />

      <div className="mb-6 rounded-lg bg-surface shadow-card p-4">
        <div className="grid gap-3 md:grid-cols-[140px_180px_160px_1fr_160px_auto]">
          <label className="text-xs text-label">주일
            <input type="date" value={sunday} onChange={(e) => changeSunday(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm text-heading" />
          </label>
          <label className="text-xs text-label">헌금구분 (고정)
            <select value={typeId} onChange={(e) => { setTypeId(Number(e.target.value)); reset(); }} className="mt-1 w-full rounded border px-2 py-1.5 text-sm text-heading">
              {OFFERING_TYPES.map((t) => <option key={t.id} value={t.id}>[{t.fund}] {t.name}</option>)}
            </select>
          </label>
          <div className="text-xs text-label">구분
            <div className="mt-1 flex overflow-hidden rounded border text-sm">
              {(["cash", "online"] as const).map((c) => (
                <button key={c} onClick={() => setChannel(c)} className={`flex-1 py-1.5 ${channel === c ? "bg-primary text-white" : "text-slate-700"}`}>
                  {c === "cash" ? "현금" : "이체"}
                </button>
              ))}
            </div>
          </div>
          <div className="relative text-xs text-label">이름 {type.totalOnly && "(총액만 입력)"}
            <input ref={nameRef} disabled={type.totalOnly} value={query}
              onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { if (suggestions[0]) { setPicked(suggestions[0]); setQuery(suggestions[0].name); } amountRef.current?.focus(); } }}
              placeholder="두 글자 이상 입력" className="mt-1 w-full rounded border px-2 py-1.5 text-sm text-heading disabled:bg-surface-2" />
            {suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded border bg-surface text-sm text-heading shadow">
                {suggestions.map((m) => (
                  <li key={m.id}><button className="w-full px-2 py-1 text-left hover:bg-surface-2" onClick={() => { setPicked(m); setQuery(m.name); amountRef.current?.focus(); }}>{m.name} {m.title && <span className="text-muted">{m.title}</span>}</button></li>
                ))}
              </ul>
            )}
          </div>
          <label className="text-xs text-label">금액 {unit > 1 && `(×${won(unit)}원)`}
            <input ref={amountRef} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && submit()} className="mt-1 w-full rounded border px-2 py-1.5 text-right text-sm text-heading" />
          </label>
          <div className="flex items-end gap-2">
            <button onClick={submit} className="rounded bg-primary px-4 py-1.5 text-sm text-white">{editId ? "수정" : "추가"}</button>
            {editId && <button onClick={reset} className="rounded border px-3 py-1.5 text-sm">취소</button>}
          </div>
        </div>
        {type.hasMemo && (
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="내용(기타감사 등)" className="mt-3 w-full rounded border px-2 py-1.5 text-sm" />
        )}
      </div>

      <div className="mb-3 flex items-center justify-between text-sm">
        <div>{sunday} 주일 · {entries.length}건 · 합계 <b>{won(grand)}원</b></div>
        {demo
          ? <button disabled className="rounded border px-3 py-1.5 text-muted" title="DB 연결 후 사용">입력 완료(저장)</button>
          : <button onClick={save} disabled={busy || !dirty} className="rounded bg-primary px-4 py-1.5 text-white disabled:bg-slate-300">{busy ? "처리 중…" : dirty ? "입력 완료(저장)" : "저장됨"}</button>}
      </div>
      {note && <div className={`mb-3 rounded px-3 py-2 text-sm ${note.ok ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>{note.text}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {byType.map(({ t, rows, total }) => (
          <div key={t.id} className="rounded-lg bg-surface shadow-card">
            <div className="flex justify-between border-b px-4 py-2 text-sm font-semibold"><span>{t.name}</span><span>{won(total)}</span></div>
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-1.5">{r.name}{r.memo && <span className="text-muted"> · {r.memo}</span>}</td>
                    <td className="px-2 text-xs text-muted">{r.channel === "cash" ? "현금" : "이체"}</td>
                    <td className="px-2 text-right">{won(r.amount)}</td>
                    <td className="w-24 px-2 text-right text-xs">
                      <button onClick={() => edit(r)} className="text-primary">수정</button>{" "}
                      <button onClick={() => setEntries((xs) => xs.filter((x) => x.id !== r.id))} className="text-red-500">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}
