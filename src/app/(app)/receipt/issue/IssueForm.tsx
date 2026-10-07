"use client";
// 영수증 발행: 기부 연도 → 기부자(교인 검색·지난 발행·직접 입력) → 가족 합산 헌금 → 발행금액·조정·부부 분할 → 발행(번호는 DB가 부여)
// 주소창: ?member=&year=&request= (신청에서 이동), ?edit=ID (수정), ?reissue=ID (재발행)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import YearSelect from "@/components/ui/YearSelect";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { thisYear, toAmount, won } from "@/lib/format";
import { aggregateIncome, allocate, fromDetail, labelOf, ratiosOk, splitAggregate, toDetail, type Aggregate } from "@/lib/receipt/calc";
import { familyOf, issueReceipts, loadFamilyIncome, RECEIPT_COLS, searchDonors, searchLabels, updateReceipt, type DonorHit, type IssueRow, type ReceiptView } from "@/lib/receipt/api";
import { brnChecksumOk, normalizeBrn, normalizeRrn } from "@/lib/receipt/validate";
import { supabaseBrowser } from "@/lib/supabase/client";
import ReceiptPreview from "../_parts/ReceiptPreview";
import PastPopup from "./PastPopup";

type Kind = "PN" | "CP";
export type Donor = {
  member_id: number | null; name: string; kind: Kind; rrn: string; address: string; brn: string; rep: string;
  rrnHint: string | null;            // 이미 있는 주민번호(마스킹) — 비우면 이것을 쓴다
  rrnFromReceipt: number | null;     // 지난 영수증 주민번호 이어쓰기
};
const EMPTY_DONOR: Donor = { member_id: null, name: "", kind: "PN", rrn: "", address: "", brn: "", rep: "", rrnHint: null, rrnFromReceipt: null };
type Partner = { member_id: number | null; name: string; rrn: string; address: string };
type Params = { member?: number; year?: number; request?: number; edit?: number; reissue?: number };

const readParams = (): Params => {
  const p = new URLSearchParams(window.location.search);
  const n = (k: string) => (p.get(k) && Number(p.get(k)) > 0 ? Number(p.get(k)) : undefined);
  return { member: n("member"), year: n("year"), request: n("request"), edit: n("edit"), reissue: n("reissue") };
};
const EMPTY_AGG: Aggregate = { total: 0, types: [], months: [], sources: [] };

export default function IssueForm() {
  return <DbOnly what="영수증 발행"><Issue /></DbOnly>;
}

function Issue() {
  const sb = supabaseBrowser()!;
  const [params] = useState(readParams);
  const target = params.edit ?? params.reissue;
  const mode: "new" | "edit" | "reissue" = params.edit ? "edit" : params.reissue ? "reissue" : "new";

  const [year, setYear] = useState(params.year ?? thisYear() - 1);
  const [donor, setDonor] = useState<Donor>(EMPTY_DONOR);
  const [requestId, setRequestId] = useState<number | null>(params.request ?? null);
  const [family, setFamily] = useState<{ id: number; name: string }[]>([]);
  const [extraLabels, setExtraLabels] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [recalc, setRecalc] = useState(mode === "new");
  const [stored, setStored] = useState<Aggregate | null>(null);
  const [adj, setAdj] = useState("0");
  const [adjReason, setAdjReason] = useState("");
  const [memo, setMemo] = useState("");
  const [split, setSplit] = useState(false);
  const [ratio, setRatio] = useState(50);
  const [partner, setPartner] = useState<Partner>({ member_id: null, name: "", rrn: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [issued, setIssued] = useState<number[] | null>(null);
  const [past, setPast] = useState(false);
  const [loadingInit, setLoadingInit] = useState(Boolean(target || params.request || params.member));
  const [blocked, setBlocked] = useState(false); // 이미 처리된 영수증·신청

  const pickMember = async (h: DonorHit, keep?: Partial<Donor>) => {
    setDonor({ ...EMPTY_DONOR, member_id: h.member_id, name: h.name, address: h.address ?? "", rrnHint: h.rrn_masked, ...keep });
    setExtraLabels([]); setExcluded([]);
    try { setFamily(await familyOf(sb, h.member_id)); } catch { setFamily([]); }
  };
  const memberHit = async (id: number) => {
    const m = must(await sb.from("member").select("name, name_suffix").eq("id", id).maybeSingle()) as { name: string; name_suffix: string | null } | null;
    return m ? (await searchDonors(sb, m.name)).find((h) => h.member_id === id) ?? null : null;
  };

  // 처음 열 때: 수정·재발행·신청·교인 지정
  useEffect(() => {
    (async () => {
      try {
        if (target) {
          const r = must(await sb.from("v_donation_receipt").select(RECEIPT_COLS).eq("id", target).maybeSingle()) as ReceiptView | null;
          if (!r) throw new Error("영수증을 찾을 수 없어요");
          const src = must(await sb.from("donation_receipt_source").select("payer_label, amount").eq("receipt_id", target)) as { payer_label: string; amount: number }[];
          setYear(r.donation_year ?? r.year);
          setDonor({ member_id: r.member_id, name: r.donor_name ?? "", kind: (r.donor_kind as Kind) ?? "PN", rrn: "", address: r.donor_address ?? "",
            brn: r.donor_brn ?? "", rep: r.donor_rep_name ?? "", rrnHint: r.donor_rrn_masked, rrnFromReceipt: null });
          setStored({ total: Number(r.total_amount), ...fromDetail(r.detail), sources: src.map((s) => ({ ...s, amount: Number(s.amount) })) });
          setAdj(String(r.adjustment_amount ?? 0)); setAdjReason(r.adjustment_reason ?? ""); setMemo(r.memo ?? "");
          if (r.member_id) setFamily(await familyOf(sb, r.member_id));
          if (r.status !== "issued") { setBlocked(true); setMsg({ ok: false, text: "발행 상태가 아닌 영수증이에요. 수정·재발행할 수 없어요." }); }
        } else if (params.request) {
          const q = must(await sb.from("v_donation_request").select("id, year, name, rrn_masked, address, member_id, status").eq("id", params.request).maybeSingle()) as
            { id: number; year: number; name: string; rrn_masked: string | null; address: string | null; member_id: number | null; status: string } | null;
          if (!q) throw new Error("신청을 찾을 수 없어요");
          setYear(params.year ?? q.year);
          const h = q.member_id ? await memberHit(q.member_id) : null;
          const keep = { name: q.name, address: q.address ?? h?.address ?? "", rrnHint: q.rrn_masked ?? h?.rrn_masked ?? null };
          if (h) await pickMember(h, keep); else setDonor({ ...EMPTY_DONOR, ...keep });
          if (q.status !== "requested") setMsg({ ok: false, text: "이미 처리된 신청이에요." });
        } else if (params.member) {
          const h = await memberHit(params.member);
          if (h) await pickMember(h);
        }
      } catch (e) { setMsg({ ok: false, text: `불러오지 못했어요: ${dbError(e)}` }); }
      finally { setLoadingInit(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const familyIds = useMemo(() => (donor.member_id ? (family.length ? family.map((f) => f.id) : [donor.member_id]) : []), [donor.member_id, family]);
  const income = useDbQuery(
    (s) => (recalc ? loadFamilyIncome(s, familyIds, year, extraLabels) : Promise.resolve([])),
    [recalc, familyIds.join(","), year, extraLabels.join("|")],
  );
  const allRows = useMemo(() => income.data ?? [], [income.data]);
  const agg = useMemo(
    () => (recalc ? aggregateIncome(allRows.filter((r) => !excluded.includes(labelOf(r)))) : stored ?? EMPTY_AGG),
    [recalc, allRows, excluded, stored],
  );
  const labelTotals = useMemo(() => aggregateIncome(allRows).sources, [allRows]);
  const adjN = toAmount(adj);
  const issuedAmount = agg.total + adjN;
  const ratios = [ratio, 100 - ratio];
  const splitAmounts = split ? allocate(Math.max(0, issuedAmount), ratios) : [issuedAmount];

  const reset = () => {
    setDonor(EMPTY_DONOR); setFamily([]); setExtraLabels([]); setExcluded([]); setAdj("0"); setAdjReason(""); setMemo("");
    setSplit(false); setPartner({ member_id: null, name: "", rrn: "", address: "" }); setRequestId(null); setIssued(null); setMsg(null);
    if (window.location.search) window.history.replaceState(null, "", "/receipt/issue");
  };

  const submit = async () => {
    setMsg(null);
    const fail = (text: string) => setMsg({ ok: false, text });
    if (!donor.name.trim()) return fail("기부자 성명을 넣어 주세요.");
    const rrn = donor.rrn.trim() ? normalizeRrn(donor.rrn) : "";
    if (rrn === null) return fail("주민번호 13자리를 확인해 주세요.");
    const brn = donor.kind === "CP" ? normalizeBrn(donor.brn) : "";
    if (brn === null) return fail("사업자번호 10자리를 확인해 주세요.");
    if (brn && !brnChecksumOk(brn) && !confirm("사업자번호 검증번호가 맞지 않아요. 그래도 발행할까요?")) return;
    if (issuedAmount <= 0) return fail("발행금액이 0원이에요.");
    if (adjN !== 0 && !adjReason.trim()) return fail("조정액이 있으면 사유를 적어 주세요.");
    if (donor.kind === "PN" && !rrn && !donor.rrnHint && !confirm("주민번호 없이 발행할까요?")) return;
    const pRrn = split && partner.rrn.trim() ? normalizeRrn(partner.rrn) : "";
    if (split) {
      if (!ratiosOk(ratios)) return fail("비율을 확인해 주세요(1~99%).");
      if (!partner.name.trim()) return fail("나눠 받을 사람 성명을 넣어 주세요.");
      if (pRrn === null) return fail("나눠 받을 사람 주민번호를 확인해 주세요.");
    }

    const base = {
      donation_year: year, donor_kind: donor.kind, adjustment_reason: adjReason.trim(), memo: memo.trim(),
      request_id: requestId, reissue_of_id: mode === "reissue" ? target ?? null : null,
    };
    const parts = split ? splitAggregate(agg, ratios) : [agg];
    const main: IssueRow = {
      ...base, member_id: donor.member_id, donor_name: donor.name.trim(), donor_address: donor.address.trim(),
      donor_rrn: rrn || undefined, rrn_from_receipt_id: donor.rrnFromReceipt,
      donor_brn: brn || undefined, donor_rep_name: donor.rep.trim(),
      total_amount: parts[0].total, issued_amount: splitAmounts[0], adjustment_amount: splitAmounts[0] - parts[0].total,
      split_ratio: split ? ratios[0] : null, detail: toDetail(parts[0]), sources: parts[0].sources,
    };
    const rows: IssueRow[] = [main];
    if (split) rows.push({
      ...base, donor_kind: "PN", member_id: partner.member_id, donor_name: partner.name.trim(), donor_address: partner.address.trim() || donor.address.trim(),
      donor_rrn: pRrn || undefined, total_amount: parts[1].total, issued_amount: splitAmounts[1], adjustment_amount: splitAmounts[1] - parts[1].total,
      split_ratio: ratios[1], detail: toDetail(parts[1]), sources: parts[1].sources, request_id: null,
    });

    setBusy(true);
    try {
      if (mode === "edit" && target) {
        // 수정: 번호·구분·연도·분할 비율은 그대로
        await updateReceipt(sb, target, {
          member_id: main.member_id, donor_name: main.donor_name, donor_address: main.donor_address, donor_rrn: main.donor_rrn,
          donor_brn: main.donor_brn, donor_rep_name: main.donor_rep_name, total_amount: agg.total, issued_amount: issuedAmount,
          adjustment_amount: adjN, adjustment_reason: main.adjustment_reason, memo: main.memo,
          ...(recalc ? { detail: main.detail, sources: main.sources } : {}),
        });
        setIssued([target]);
        setMsg({ ok: true, text: "고쳤어요. 발행번호는 그대로예요." });
      } else {
        const out = await issueReceipts(sb, rows);
        setIssued(out.map((r) => r.id));
        setMsg({ ok: true, text: `발행했어요: ${out.map((r) => r.serial_no).join(", ")}` });
      }
    } catch (e) { setMsg({ ok: false, text: `발행하지 못했어요: ${dbError(e)}` }); }
    finally { setBusy(false); }
  };

  const title = { new: "", edit: "영수증 수정", reissue: "영수증 재발행" }[mode];

  if (issued) return (
    <>
      <div className="no-print">
        <PageHeader actions={<><Link href="/receipt/status" className={btn}>발행현황</Link><button onClick={reset} className={btnPrimary}>새 영수증</button></>} />
        {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      </div>
      <ReceiptPreview ids={issued} />
    </>
  );

  return (
    <>
      <PageHeader actions={<>
        {title && <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">{title}</span>}
        {requestId && <span className="rounded bg-primary-subtle px-2 py-1 text-xs text-primary">신청 #{requestId}에서 왔어요</span>}
        {mode === "new" && (donor.name || requestId) && <button onClick={reset} className={btn}>처음부터</button>}
      </>} />
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      {loadingInit && <div className="mb-3 text-sm text-muted">불러오는 중…</div>}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <section className={`${card} p-4`}>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <label className="text-xs text-label">기부 연도<br />
                {mode === "new" ? <YearSelect value={year} onChange={setYear} to={thisYear()} /> : <b className="text-sm text-heading">{year}년</b>}
              </label>
              {mode !== "edit" && <DonorSearch onPick={(h) => pickMember(h)} />}
            </div>
            <DonorFields donor={donor} setDonor={setDonor} locked={mode !== "new"} onPast={() => setPast(true)} />
          </section>

          <section className={`${card} p-4`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{year}년 헌금 합산 {donor.member_id && family.length > 1 && <span className="font-normal text-muted">· 가족 {family.map((f) => f.name).join(", ")}</span>}</h2>
              {!recalc && <button onClick={() => setRecalc(true)} className={btn}>헌금 다시 합산</button>}
            </div>
            {!recalc && <p className="mb-2 text-xs text-muted">저장된 헌금 내역이에요. 바꾸려면 &lsquo;헌금 다시 합산&rsquo;을 누르세요.</p>}
            {recalc && (
              <>
                {income.error && <Notice kind="error">헌금을 불러오지 못했어요: {income.error}</Notice>}
                {!donor.member_id && !extraLabels.length && <p className="mb-2 text-xs text-muted">교인을 고르면 가족 헌금이 합산돼요. 교인이 아니면 아래에서 헌금 표기를 찾아 넣으세요.</p>}
                <LabelPicker year={year} onAdd={(l) => setExtraLabels((xs) => [...new Set([...xs, l])])} />
                {labelTotals.length > 0 && (
                  <table className="mt-3 w-full text-sm">
                    <thead className="text-xs text-label"><tr><th className="w-10" /><th className="text-left">헌금 표기</th><th className="text-right">금액</th></tr></thead>
                    <tbody>
                      {labelTotals.map((s) => (
                        <tr key={s.payer_label} className="border-t">
                          <td><input type="checkbox" aria-label="포함" checked={!excluded.includes(s.payer_label)}
                            onChange={(e) => setExcluded((xs) => (e.target.checked ? xs.filter((x) => x !== s.payer_label) : [...xs, s.payer_label]))} /></td>
                          <td className="py-1">{s.payer_label}{extraLabels.includes(s.payer_label) && <span className="text-xs text-muted"> (직접 추가)</span>}</td>
                          <td className="text-right">{won(s.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <table className="w-full text-sm">
                <thead className="text-xs text-label"><tr><th className="text-left">헌금구분</th><th className="text-right">금액</th></tr></thead>
                <tbody>
                  {agg.types.map((t) => <tr key={t.name} className="border-t"><td className="py-1">{t.name}</td><td className="text-right">{won(t.amount)}</td></tr>)}
                  {!agg.types.length && <tr><td colSpan={2} className="py-2 text-xs text-muted">{income.loading ? "불러오는 중…" : "합산할 헌금이 없어요."}</td></tr>}
                </tbody>
              </table>
              <table className="w-full text-sm">
                <thead className="text-xs text-label"><tr><th className="text-left">월</th><th className="text-right">금액</th></tr></thead>
                <tbody>{agg.months.map((m) => <tr key={m.month} className="border-t"><td className="py-1">{m.month}월</td><td className="text-right">{won(m.amount)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className={`${card} space-y-3 p-4`}>
            <h2 className="text-sm font-semibold">발행금액</h2>
            <Row label="실헌금 합계" value={`${won(agg.total)}원`} />
            <label className="block text-xs text-label">조정액(+/−)
              <input value={adj} onChange={(e) => setAdj(e.target.value.replace(/[^\d,-]/g, ""))} inputMode="numeric" className={`${input} mt-1 w-full text-right`} />
            </label>
            {adjN !== 0 && <input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="조정 사유(필수)" className={`${input} w-full`} />}
            <Row label="발행금액" value={<b className="text-base">{won(issuedAmount)}원</b>} />

            {mode === "new" && donor.kind === "PN" && (
              <div className="rounded border p-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> 부부 비율로 나눠 발행</label>
                {split && (
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-xs text-label">{donor.name || "기부자"}</span>
                      <input type="number" min={1} max={99} value={ratio} onChange={(e) => setRatio(Math.min(99, Math.max(1, Number(e.target.value) || 50)))} className={`${input} w-20 text-right`} />%
                      <span className="ml-auto">{won(splitAmounts[0])}원</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={partner.member_id ?? ""} onChange={(e) => {
                        const f = family.find((x) => x.id === Number(e.target.value));
                        setPartner({ ...partner, member_id: f?.id ?? null, name: f?.name ?? partner.name });
                      }} className={`${input} w-28`}>
                        <option value="">직접 입력</option>
                        {family.filter((f) => f.id !== donor.member_id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      <span className="w-12 text-right">{100 - ratio}%</span>
                      <span className="ml-auto">{won(splitAmounts[1])}원</span>
                    </div>
                    <input value={partner.name} onChange={(e) => setPartner({ ...partner, name: e.target.value })} placeholder="성명" className={`${input} w-full`} />
                    <input value={partner.rrn} onChange={(e) => setPartner({ ...partner, rrn: e.target.value })} placeholder={partner.member_id ? "주민번호(비우면 교인정보)" : "주민번호 900101-1234567"} autoComplete="off" className={`${input} w-full`} />
                    <input value={partner.address} onChange={(e) => setPartner({ ...partner, address: e.target.value })} placeholder="주소(비우면 같은 주소)" className={`${input} w-full`} />
                    <p className="text-xs text-muted">헌금구분·월별 금액도 같은 비율로 나눠요. 원 단위 끝수는 큰 쪽에 붙어요.</p>
                  </div>
                )}
              </div>
            )}
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모(재정부만 봄)" rows={2} className={`${input} w-full`} />
            <button onClick={submit} disabled={busy || loadingInit || blocked} className={`${btnPrimary} w-full py-2`}>
              {busy ? "처리 중…" : mode === "edit" ? "수정 저장" : mode === "reissue" ? "재발행(새 번호)" : split ? "2건 발행" : "발행"}
            </button>
            <p className="text-xs text-muted">발행번호 {"{연도}-{PN|CP}{일련3}-{MMDD}"}는 저장할 때 DB가 겹치지 않게 붙여요. 연도는 기부 연도예요 [확인 필요].</p>
          </section>
        </aside>
      </div>
      {past && <PastPopup name={donor.name} memberId={donor.member_id} onClose={() => setPast(false)}
        onUse={(r) => { setDonor({ ...donor, name: r.donor_name ?? donor.name, kind: (r.donor_kind as Kind) ?? "PN", address: r.donor_address ?? "",
          brn: r.donor_brn ?? "", rep: r.donor_rep_name ?? "", rrn: "", rrnHint: r.donor_rrn_masked, rrnFromReceipt: r.has_rrn ? r.id : null }); setPast(false); }} />}
    </>
  );
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between text-sm"><span className="text-label">{label}</span><span>{value}</span></div>
);

function DonorSearch({ onPick }: { onPick: (h: DonorHit) => void }) {
  const sb = supabaseBrowser()!;
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DonorHit[] | null>(null);
  const [err, setErr] = useState("");
  const find = async () => {
    if (!q.trim()) return;
    setErr("");
    try { setHits(await searchDonors(sb, q.trim())); } catch (e) { setErr(dbError(e)); }
  };
  return (
    <div className="relative min-w-[260px] flex-1 text-xs text-label">교인 찾기(가족 포함)
      <div className="mt-1 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} placeholder="이름" className={`${input} flex-1`} />
        <button onClick={find} className={btn}>찾기</button>
      </div>
      {err && <div className="mt-1 text-danger">{err}</div>}
      {hits && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded border bg-surface text-sm text-heading shadow">
          {!hits.length && <li className="px-3 py-2 text-muted">찾는 교인이 없어요. 아래에 직접 입력하세요.</li>}
          {hits.map((h) => (
            <li key={h.member_id}>
              <button onClick={() => { onPick(h); setHits(null); setQ(""); }} className="w-full px-3 py-1.5 text-left hover:bg-surface-2">
                {h.name} {h.title && <span className="text-muted">{h.title}</span>} {h.is_household_head && <span className="text-xs text-primary">가장</span>}
                <span className="block text-xs text-muted">{h.rrn_masked ?? "주민번호 없음"} · {h.family.length ? `가족 ${h.family.join(", ")}` : "가족 없음"}</span>
              </button>
            </li>
          ))}
          <li><button onClick={() => setHits(null)} className="w-full px-3 py-1 text-right text-xs text-muted">닫기</button></li>
        </ul>
      )}
    </div>
  );
}

function DonorFields({ donor, setDonor, locked, onPast }: { donor: Donor; setDonor: (d: Donor) => void; locked: boolean; onPast: () => void }) {
  const set = (p: Partial<Donor>) => setDonor({ ...donor, ...p });
  const cp = donor.kind === "CP";
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="flex items-end gap-2 md:col-span-2">
        <div className="flex overflow-hidden rounded border text-sm">
          {(["PN", "CP"] as const).map((k) => (
            <button key={k} disabled={locked} onClick={() => set({ kind: k })} className={`px-3 py-1.5 ${donor.kind === k ? "bg-primary text-white" : ""} disabled:opacity-70`}>{k === "PN" ? "개인(PN)" : "법인(CP)"}</button>
          ))}
        </div>
        {donor.member_id && <span className="rounded bg-primary-subtle px-2 py-1 text-xs text-primary">교인 연결됨 <button onClick={() => set({ member_id: null })} className="ml-1" aria-label="연결 끊기">×</button></span>}
        <button onClick={onPast} disabled={!donor.name.trim()} className={`${btn} ml-auto`}>지난 발행 기록</button>
      </div>
      <label className="text-xs text-label">{cp ? "법인명" : "성명"}
        <input value={donor.name} onChange={(e) => set({ name: e.target.value })} className={`${input} mt-1 w-full`} />
      </label>
      {cp ? (
        <>
          <label className="text-xs text-label">사업자등록번호
            <input value={donor.brn} onChange={(e) => set({ brn: e.target.value })} placeholder="123-45-67890" className={`${input} mt-1 w-full`} />
          </label>
          <label className="text-xs text-label">대표자명
            <input value={donor.rep} onChange={(e) => set({ rep: e.target.value })} className={`${input} mt-1 w-full`} />
          </label>
        </>
      ) : (
        <label className="text-xs text-label">주민등록번호 {donor.rrnHint && <span className="text-muted">· 저장된 번호 {donor.rrnHint} (비우면 그대로)</span>}
          <input value={donor.rrn} onChange={(e) => set({ rrn: e.target.value })} placeholder={donor.rrnHint ? "바꿀 때만 입력" : "900101-1234567"} autoComplete="off" className={`${input} mt-1 w-full`} />
        </label>
      )}
      <label className={`text-xs text-label ${cp ? "" : "md:col-span-2"}`}>{cp ? "소재지" : "주소"}
        <input value={donor.address} onChange={(e) => set({ address: e.target.value })} className={`${input} mt-1 w-full`} />
      </label>
    </div>
  );
}

function LabelPicker({ year, onAdd }: { year: number; onAdd: (label: string) => void }) {
  const sb = supabaseBrowser()!;
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ label: string; amount: number }[] | null>(null);
  const [err, setErr] = useState("");
  const find = async () => {
    if (!q.trim()) return;
    setErr("");
    try { setHits(await searchLabels(sb, year, q.trim())); } catch (e) { setErr(dbError(e)); }
  };
  return (
    <div className="text-xs text-label">교인에 연결 안 된 헌금 표기 더하기(공동명의·가족 묶음 등)
      <div className="mt-1 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} placeholder="표기 일부, 예: 가나다" className={`${input} flex-1`} />
        <button onClick={find} className={btn}>찾기</button>
      </div>
      {err && <div className="mt-1 text-danger">{err}</div>}
      {hits && (
        <div className="mt-2 flex flex-wrap gap-2">
          {!hits.length && <span className="text-muted">{year}년에 맞는 표기가 없어요.</span>}
          {hits.map((h) => (
            <button key={h.label} onClick={() => { onAdd(h.label); setHits(hits.filter((x) => x.label !== h.label)); }} className="rounded border px-2 py-1 text-heading hover:bg-surface-2">
              + {h.label} <span className="text-muted">{won(h.amount)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
