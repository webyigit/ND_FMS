"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { readFirstSheet } from "@/lib/bank/readXlsx";
import { isNonghyupFile, parseNonghyupRows } from "@/lib/bank/nonghyup";
import { keywordsFor, type HistoryHit, type MemberRef } from "@/lib/classify";
import { useRefData } from "@/lib/db/refData";
import { must, useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { won } from "@/lib/format";
import { linkProblems, suggest, toImportRows, toLinkPayload, type LinkDraft } from "@/lib/income/bank";
import { addDays, isSunday, kstDate, kstDateTime, sundayOf } from "@/lib/income/dates";
import { fetchAll } from "@/lib/income/db";
import { supabaseBrowser } from "@/lib/supabase/client";

type Account = { id: number; bank: string | null; holder: string | null; kind: string | null; is_primary: boolean | null; account_mask: string | null };
type Tx = {
  id: number; bank_account_id: number | null; tx_at: string; tx_date: string; withdraw: number; deposit: number; balance: number | null;
  tx_type: string | null; description: string | null; transfer_memo: string | null; tx_memo: string | null;
  suggested_offering_type_id: number | null; suggested_member_id: number | null; linked: boolean;
  income_id: number | null; income_sunday: string | null; income_closed: boolean | null; income_offering_type: string | null; income_payer_label: string | null;
};
type View = "open" | "deposit" | "linked" | "withdraw" | "all";
const VIEWS: [View, string][] = [["open", "입금 · 미반영"], ["deposit", "입금 전체"], ["linked", "반영됨"], ["withdraw", "출금"], ["all", "전체"]];
const today = () => kstDate(new Date().toISOString());
const accLabel = (a: Account) => [a.bank, a.kind, a.account_mask, a.holder].filter(Boolean).join(" ");
const th = "px-2 py-2 text-left font-medium";

export default function BankDb() {
  const sb = supabaseBrowser()!;
  const { ref, error: refErr } = useRefData();
  const [uploadAcc, setUploadAcc] = useState<string>("");
  const [filterAcc, setFilterAcc] = useState<string>("all");
  const [from, setFrom] = useState(() => addDays(today(), -60));
  const [to, setTo] = useState(today);
  const [view, setView] = useState<View>("open");
  const [mode, setMode] = useState<"prev" | "next">("prev");
  const [edits, setEdits] = useState<Record<number, Partial<LinkDraft>>>({});
  const [memberQ, setMemberQ] = useState<Record<number, string>>({}); // 교인 칸에 친 글자
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);

  const accounts = useDbQuery(async (c) => must(await c.from("v_bank_account").select("*").eq("active", true).order("id")) as Account[], []);
  // 교인 별칭 + 과거 반영 이력(같은 적요 → 같은 분류)
  const learn = useDbQuery(async (c) => {
    const [alias, hist] = await Promise.all([
      fetchAll<{ member_id: number; alias: string }>((a, b) => c.from("member_alias").select("member_id, alias").order("id").range(a, b)),
      fetchAll<{ description: string | null; income_offering_type_id: number | null; income_member_id: number | null }>((a, b) =>
        c.from("v_bank_tx").select("description, income_offering_type_id, income_member_id").not("income_id", "is", null).order("id", { ascending: false }).range(a, b)),
    ]);
    const history: HistoryHit[] = hist.filter((h) => h.description && h.income_offering_type_id)
      .map((h) => ({ description: h.description!, offeringTypeId: h.income_offering_type_id!, memberId: h.income_member_id }));
    return { alias, history };
  }, []);
  const txs = useDbQuery(async (c) => fetchAll<Tx>((a, b) => {
    let q = c.from("v_bank_tx").select("*").gte("tx_date", from).lte("tx_date", to);
    if (filterAcc === "none") q = q.is("bank_account_id", null);
    else if (filterAcc !== "all") q = q.eq("bank_account_id", Number(filterAcc));
    return q.order("tx_at", { ascending: false }).order("id").range(a, b);
  }), [from, to, filterAcc]);

  const types = useMemo(() => ref?.offeringTypes ?? [], [ref]);
  const members = useMemo<MemberRef[]>(() => (ref?.members ?? []).map((m) => ({
    id: m.id, name: m.name, aliases: (learn.data?.alias ?? []).filter((a) => a.member_id === m.id).map((a) => a.alias),
  })), [ref, learn.data]);
  const keywords = useMemo(() => keywordsFor(types), [types]);
  const nameOf = (id: number | null) => members.find((m) => m.id === id)?.name ?? "";

  // 미반영 입금의 기본 제안값(자동분류). 화면에서 고친 값(edits)이 위에 덮인다
  const defaults = useMemo(() => {
    const out: Record<number, LinkDraft> = {};
    (txs.data ?? []).filter((t) => t.deposit > 0 && !t.linked).forEach((t) => {
      const desc = t.description ?? "";
      const s = suggest(desc, keywords, members, learn.data?.history ?? []);
      const useStored = s.source === "none" && (t.suggested_offering_type_id || t.suggested_member_id);
      const memberId = useStored ? t.suggested_member_id : s.memberId;
      out[t.id] = {
        txId: t.id, description: desc,
        typeId: useStored ? t.suggested_offering_type_id : s.typeId,
        memberId, payerLabel: useStored ? nameOf(memberId) || desc : s.payerLabel,
        memo: "", sunday: sundayOf(t.tx_date, mode),
      };
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs.data, keywords, members, learn.data, mode]);
  const draft = (id: number): LinkDraft => ({ ...defaults[id], ...edits[id] });
  const setDraft = (id: number, p: Partial<LinkDraft>) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...p } }));

  const all = useMemo(() => txs.data ?? [], [txs.data]);
  const rows = useMemo(() => all.filter((t) => {
    if (view === "open") return t.deposit > 0 && !t.linked;
    if (view === "deposit") return t.deposit > 0;
    if (view === "linked") return t.linked;
    if (view === "withdraw") return t.withdraw > 0;
    return true;
  }), [all, view]);
  const stat = useMemo(() => {
    const dep = all.filter((t) => t.deposit > 0), open = dep.filter((t) => !t.linked), out = all.filter((t) => t.withdraw > 0);
    const sum = (xs: Tx[], k: "deposit" | "withdraw") => xs.reduce((s, t) => s + Number(t[k]), 0);
    return { dep: [dep.length, sum(dep, "deposit")], open: [open.length, sum(open, "deposit")], out: [out.length, sum(out, "withdraw")] };
  }, [all]);
  const openRows = rows.filter((t) => t.deposit > 0 && !t.linked);
  const picked = openRows.filter((t) => selected.has(t.id));

  const onFile = async (f: File) => {
    setNote(null); setBusy(true);
    try {
      const tx = parseNonghyupRows(await readFirstSheet(await f.arrayBuffer()));
      if (!tx.length) throw new Error("거래가 없어요.");
      const payload = toImportRows(tx, (t) => suggest(t.description, keywords, members, learn.data?.history ?? []));
      const { data, error } = await sb.rpc("import_bank_tx", { p_account_id: uploadAcc ? Number(uploadAcc) : null, p_file_name: f.name, p_rows: payload });
      if (error) throw error;
      const r = data as { inserted: number; skipped: number };
      const dates = tx.map((t) => kstDate(t.txAt)).sort();
      setFrom(dates[0]); setTo(dates[dates.length - 1]); setFilterAcc(uploadAcc || "none"); setView("open");
      const warn = isNonghyupFile(f.name) ? "" : " (파일명이 '농협_'으로 시작하지 않지만 농협 양식으로 읽었어요)";
      setNote({ kind: r.inserted ? "ok" : "warn", text: `${r.inserted}건 저장했어요. ${r.skipped ? `이미 올라와 있는 ${r.skipped}건은 건너뛰었어요.` : ""}${warn}` });
      txs.reload(); learn.reload();
    } catch (e) {
      setNote({ kind: "error", text: `올리지 못했어요: ${e instanceof Error ? e.message : dbError(e)}` });
    } finally { setBusy(false); }
  };

  const link = async () => {
    const ds = picked.map((t) => draft(t.id));
    const bad = linkProblems(ds);
    if (bad.length) return setNote({ kind: "error", text: `고칠 곳이 있어요 — ${bad.join(" / ")}` });
    setBusy(true); setNote(null);
    const { data, error } = await sb.rpc("link_bank_tx_to_income", { p_rows: toLinkPayload(ds) });
    setBusy(false);
    if (error) return setNote({ kind: "error", text: `반영하지 못했어요: ${dbError(error)}` });
    setNote({ kind: "ok", text: `${data}건을 수입(이체)으로 반영했어요.` });
    setSelected(new Set()); setEdits({}); setMemberQ({});
    txs.reload(); learn.reload();
  };

  const unlink = async (t: Tx) => {
    if (!confirm(`${t.income_sunday} 주일 수입에서 이 거래(${won(t.deposit)}원)를 지울까요?`)) return;
    setBusy(true); setNote(null);
    const { error } = await sb.rpc("unlink_bank_tx", { p_tx_ids: [t.id] });
    setBusy(false);
    if (error) return setNote({ kind: "error", text: `되돌리지 못했어요: ${dbError(error)}` });
    setNote({ kind: "ok", text: "되돌렸어요. 다시 반영할 수 있어요." });
    txs.reload(); learn.reload();
  };

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const err = refErr ?? accounts.error ?? learn.error ?? txs.error;

  return (
    <>
      <PageHeader actions={<span className="rounded bg-surface-2 px-2 py-1 text-xs text-label">파일은 브라우저에서 읽고 거래만 저장해요</span>} />
      {err && <Notice kind="error">불러오지 못했어요: {err}</Notice>}

      <div className={`${card} mb-4 flex flex-wrap items-end gap-3 p-4 text-sm`}>
        <label className="text-xs text-label">입금 계좌
          <select value={uploadAcc} onChange={(e) => setUploadAcc(e.target.value)} className={`${input} mt-1 block`}>
            <option value="">계좌 없이</option>
            {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{accLabel(a)}{a.is_primary ? " (주)" : ""}</option>)}
          </select>
        </label>
        <label className="text-xs text-label">농협 거래내역 엑셀(.xlsx)
          <input type="file" accept=".xlsx" disabled={busy || !ref} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} className="mt-1 block text-sm text-heading" />
        </label>
        <p className="text-xs text-muted">같은 거래(계좌·일시·금액·잔액)는 다시 올려도 한 번만 저장돼요. 다른 은행 양식은 [확인 필요]</p>
      </div>
      {note && <Notice kind={note.kind}>{note.text}</Notice>}

      <div className={`${card} mb-3 flex flex-wrap items-end gap-3 p-3 text-sm`}>
        <label className="text-xs text-label">기간
          <span className="mt-1 flex items-center gap-1">
            <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className={input} />~
            <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className={input} />
          </span>
        </label>
        <label className="text-xs text-label">계좌
          <select value={filterAcc} onChange={(e) => setFilterAcc(e.target.value)} className={`${input} mt-1 block`}>
            <option value="all">전체</option>
            <option value="none">계좌 없이 올린 것</option>
            {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}
          </select>
        </label>
        <div className="flex overflow-hidden rounded border">
          {VIEWS.map(([v, l]) => <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 ${view === v ? "bg-primary text-white" : ""}`}>{l}</button>)}
        </div>
        <label className="text-xs text-label" title="거래일이 평일일 때 어느 주일 수입으로 넣을지">평일 입금 반영 주일 [확인 필요]
          <select value={mode} onChange={(e) => setMode(e.target.value as "prev" | "next")} className={`${input} mt-1 block`}>
            <option value="prev">직전 주일(기본)</option>
            <option value="next">다음 주일</option>
          </select>
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span>입금 {stat.dep[0]}건 · {won(stat.dep[1])}원</span>
        <span className="text-warning">미반영 {stat.open[0]}건 · {won(stat.open[1])}원</span>
        <span className="text-label">출금 {stat.out[0]}건 · {won(stat.out[1])}원</span>
        <button onClick={link} disabled={busy || !picked.length} className={`${btnPrimary} ml-auto`}>
          {busy ? "처리 중…" : `선택 ${picked.length}건 수입으로 반영`}
        </button>
      </div>
      {view === "withdraw" && <Notice kind="warn">출금은 목록만 보여요. 지출로 넣는 것은 지출관리 &gt; 지출입력에서 해요.</Notice>}

      {txs.loading ? <div className="text-sm text-muted">불러오는 중…</div> : rows.length === 0 ? (
        <div className={`${card} p-6 text-center text-sm text-muted`}>이 기간에 해당하는 거래가 없어요.</div>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <datalist id="bank-members">{members.map((m) => <option key={m.id} value={m.name} />)}</datalist>
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-label">
              <tr>
                <th className="w-8 px-2 py-2">
                  <input type="checkbox" aria-label="미반영 입금 모두 선택" checked={openRows.length > 0 && openRows.every((t) => selected.has(t.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(openRows.map((t) => t.id)) : new Set())} />
                </th>
                <th className={th}>거래일시</th><th className={`${th} text-right`}>입금</th><th className={`${th} text-right`}>출금</th>
                <th className={th}>거래기록사항</th><th className={th}>헌금구분</th><th className={th}>교인(대표)</th><th className={th}>표기</th>
                <th className={th}>메모</th><th className={th}>반영 주일</th><th className={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const open = t.deposit > 0 && !t.linked;
                const d = open ? draft(t.id) : null;
                return (
                  <tr key={t.id} className={`border-t align-top ${t.linked ? "bg-success-subtle/40" : ""}`}>
                    <td className="px-2 py-1.5 text-center">{open && <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{kstDateTime(t.tx_at)}<div className="text-xs text-muted">{t.tx_type}</div></td>
                    <td className="px-2 py-1.5 text-right">{t.deposit ? won(t.deposit) : ""}</td>
                    <td className="px-2 py-1.5 text-right text-label">{t.withdraw ? won(t.withdraw) : ""}</td>
                    <td className="px-2 py-1.5">{t.description}{(t.transfer_memo || t.tx_memo) && <div className="text-xs text-muted">{[t.transfer_memo, t.tx_memo].filter(Boolean).join(" · ")}</div>}</td>
                    {d ? (
                      <>
                        <td className="px-2 py-1">
                          <select value={d.typeId ?? ""} onChange={(e) => setDraft(t.id, { typeId: Number(e.target.value) || null })}
                            className={`rounded border px-1 py-1 ${d.typeId ? "" : "border-danger"}`}>
                            <option value="">선택</option>
                            {types.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input list="bank-members" value={memberQ[t.id] ?? nameOf(d.memberId)}
                            onChange={(e) => {
                              const q = e.target.value;
                              setMemberQ((s) => ({ ...s, [t.id]: q }));
                              setDraft(t.id, { memberId: members.find((x) => x.name === q.trim())?.id ?? null });
                            }}
                            placeholder="미등록" className={`w-24 rounded border px-1 py-1 ${d.memberId ? "" : "text-muted"}`} />
                        </td>
                        <td className="px-2 py-1"><input value={d.payerLabel} onChange={(e) => setDraft(t.id, { payerLabel: e.target.value })} className="w-28 rounded border px-1 py-1" /></td>
                        <td className="px-2 py-1"><input value={d.memo} onChange={(e) => setDraft(t.id, { memo: e.target.value })} className="w-24 rounded border px-1 py-1" /></td>
                        <td className="px-2 py-1">
                          <input type="date" value={d.sunday} onChange={(e) => setDraft(t.id, { sunday: e.target.value })}
                            className={`rounded border px-1 py-1 ${isSunday(d.sunday) ? "" : "border-danger"}`} />
                        </td>
                        <td />
                      </>
                    ) : t.linked ? (
                      <>
                        <td className="px-2 py-1.5" colSpan={4}>
                          <span className="rounded bg-success-subtle px-2 py-0.5 text-xs text-success">반영됨</span>{" "}
                          {t.income_offering_type} · {t.income_payer_label}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{t.income_sunday}{t.income_closed && <span className="ml-1 text-xs text-muted">(마감)</span>}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button onClick={() => unlink(t)} disabled={busy || !!t.income_closed} title={t.income_closed ? "마감된 주는 되돌릴 수 없어요" : ""}
                            className="text-xs text-danger disabled:text-muted">되돌리기</button>
                        </td>
                      </>
                    ) : (
                      <td colSpan={6} className="px-2 py-1.5 text-xs text-muted">{t.balance != null && `잔액 ${won(t.balance)}`}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        자동분류는 과거 반영 이력 → 적요의 헌금 키워드 → 교인 이름·별칭(가족 묶음) 순서로 제안해요. 반영하면 이체 수입으로 그 주일에 들어가고,
        수입입력 화면에서 저장해도 지워지지 않아요. 가족 묶음 입금은 대표 교인 한 명에게 넣고 표기에 이름을 남겨요 [확인 필요].
      </p>
      <button onClick={() => { txs.reload(); learn.reload(); accounts.reload(); }} className={`${btn} no-print mt-2`}>새로고침</button>
    </>
  );
}
