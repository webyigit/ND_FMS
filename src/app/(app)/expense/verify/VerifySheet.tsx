"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import { ExcelButton, PrintButton, btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { supabaseBrowser } from "@/lib/supabase/client";
import { currentSunday } from "@/lib/demo";
import { fileName, toAmount, won } from "@/lib/format";
import { downloadXlsx } from "@/lib/excel";
import { fromReconRow, reconcile, verdict, type ReconRow } from "@/lib/reconcile";
import { isAdmin, loadFundBalances } from "@/lib/expense/db";
import { isSunday, sundayOf } from "@/lib/expense/week";

type Recon = ReconRow & { sunday: string; closed: boolean; note: string | null };
type Data = { sunday: string; closed: boolean; saved: Recon | null; ledger: number; separate: number; lastH: number | null; history: Recon[]; admin: boolean };

export default function VerifySheet() {
  return <DbOnly what="검증시트"><Screen /></DbOnly>;
}

function Screen() {
  const [sunday, setSunday] = useState(currentSunday);
  const [withCarry, setWithCarry] = useState(true);
  const q = useDbQuery(async (sb): Promise<Data> => {
    const year = Number(sunday.slice(0, 4));
    const [week, saved, ledger, funds, last, history, admin] = await Promise.all([
      sb.from("week").select("closed").eq("sunday", sunday).maybeSingle().then(must),
      sb.from("v_reconciliation").select("*").eq("sunday", sunday).maybeSingle().then(must),
      sb.rpc("ledger_balance", { p_sunday: sunday, p_with_carry: withCarry }).then(must),
      loadFundBalances(sb, sunday),
      sb.from("v_reconciliation").select("base_surplus").lt("sunday", sunday).order("sunday", { ascending: false }).limit(1).then(must),
      sb.from("v_reconciliation").select("*").eq("year", year).order("sunday", { ascending: false }).then(must),
      isAdmin(sb),
    ]);
    const lastH = (last as { base_surplus: number | null }[])[0]?.base_surplus;
    return {
      sunday,
      closed: !!(week as { closed: boolean } | null)?.closed,
      saved: saved as Recon | null,
      ledger: Number(ledger ?? 0),
      separate: funds.filter((f) => f.kind === "separate").reduce((s, f) => s + f.balance, 0),
      lastH: lastH == null ? null : Number(lastH),
      history: history as Recon[],
      admin,
    };
  }, [sunday, withCarry]);

  const pick = (d: string) => { if (d) setSunday(isSunday(d) ? d : sundayOf(d)); };
  const excel = () => q.data && downloadXlsx(fileName(`검증시트_${sunday.slice(0, 4)}`, "xlsx"), [{
    name: "검증",
    rows: [["주일", "A 통장잔액", "B 입금예정", "C 실잔액", "D 해외선교 미입금", "E 계좌잔액", "F 장부잔액", "G 유용가능", "H 기준잉여금", "G−H", "판정", "메모"],
      ...q.data.history.map((r) => { const i = fromReconRow(r), c = reconcile(i), v = verdict(c.diff); return [r.sunday, i.bankBalance, i.pendingDeposit, c.realBalance, i.missionUnremitted, c.accountBalance, i.ledgerBalance, c.available, i.baseSurplus, c.diff, v.label, r.note ?? ""]; })],
    widths: [12, 14, 12, 14, 14, 14, 14, 12, 14, 12, 8, 20],
  }]);

  return (
    <>
      <PageHeader actions={<><ExcelButton onClick={excel} disabled={!q.data?.history.length} /><PrintButton /></>} />
      <div className={`${card} no-print mb-4 flex flex-wrap items-end gap-3 p-4 text-sm`}>
        <label className="text-xs text-label">주일
          <input type="date" value={sunday} onChange={(e) => pick(e.target.value)} className={`${input} mt-1 block`} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={withCarry} onChange={(e) => setWithCarry(e.target.checked)} /> F에 이월금 포함
        </label>
        <span className="pb-2 text-xs text-muted">F = 이월금 + 그 주까지 수입 − 지출(일반+특별, 별도 기금 제외). 이월금을 넣으면 H(전년 이월 기준잉여금)와 겹칠 수 있어요 [확인 필요]</span>
      </div>
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      {q.data?.sunday !== sunday && !q.error && <div className="text-sm text-muted">불러오는 중…</div>}
      {q.data?.sunday === sunday && <Sheet key={`${sunday}-${JSON.stringify(q.data.saved)}-${q.data.closed}-${q.data.lastH}`} sunday={sunday} d={q.data} reload={q.reload} />}

      {q.data && q.data.history.length > 0 && (
        <div className={`${card} no-print mt-6 overflow-x-auto`}>
          <div className="px-4 pt-3 text-sm font-semibold text-heading">{sunday.slice(0, 4)}년 검증 기록</div>
          <table className="mt-2 w-full whitespace-nowrap text-sm">
            <thead className="bg-surface-2 text-xs text-label">
              <tr><th className="px-3 py-2 text-left">주일</th><th className="text-right">A 통장</th><th className="text-right">C 실잔액</th><th className="text-right">E 계좌</th><th className="text-right">F 장부</th><th className="text-right">G−H</th><th>판정</th><th>마감</th></tr>
            </thead>
            <tbody>
              {q.data.history.map((r) => {
                const i = fromReconRow(r), c = reconcile(i), v = verdict(c.diff);
                return (
                  <tr key={r.sunday} className={`cursor-pointer border-t hover:bg-surface-2 ${r.sunday === sunday ? "bg-primary-subtle" : ""}`} onClick={() => setSunday(r.sunday)}>
                    <td className="px-3 py-1.5">{r.sunday}</td><td className="text-right">{won(i.bankBalance)}</td><td className="text-right">{won(c.realBalance)}</td>
                    <td className="text-right">{won(c.accountBalance)}</td><td className="text-right">{won(i.ledgerBalance)}</td><td className="text-right">{won(c.diff)}</td>
                    <td className="text-center"><Badge label={v.label} /></td><td className="text-center text-xs">{r.closed ? "마감" : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-muted">목록의 F는 이월금을 넣은 값이에요.</p>
        </div>
      )}
    </>
  );
}

function Badge({ label }: { label: string }) {
  const c = label === "일치" ? "bg-success-subtle text-success" : label === "부족" ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning";
  return <span className={`rounded px-2 py-0.5 text-xs ${c}`}>{label}</span>;
}

function Sheet({ sunday, d, reload }: { sunday: string; d: Data; reload: () => void }) {
  const sb = supabaseBrowser()!;
  const s = d.saved;
  const init = (v: number | string | null | undefined) => (v == null ? "" : won(Number(v)));
  const [a, setA] = useState(init(s?.bank_balance));
  const [b, setB] = useState(init(s?.pending_deposit));
  const [dd, setD] = useState(init(s?.mission_unremitted));
  const [h, setH] = useState(init(s?.base_surplus ?? d.lastH));
  const [note, setNote] = useState(s?.note ?? "");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const i = { bankBalance: toAmount(a), pendingDeposit: toAmount(b), missionUnremitted: toAmount(dd), ledgerBalance: d.ledger, baseSurplus: toAmount(h) };
  const c = reconcile(i);
  const v = verdict(c.diff);

  const save = async () => {
    setBusy(true); setErr(""); setMsg("");
    const { error } = await sb.rpc("save_reconciliation", {
      p_sunday: sunday, p_bank_balance: i.bankBalance, p_pending_deposit: i.pendingDeposit,
      p_mission_unremitted: i.missionUnremitted, p_base_surplus: i.baseSurplus, p_note: note,
    });
    setBusy(false);
    if (error) return setErr(`저장하지 못했어요: ${dbError(error)}`);
    setMsg("저장했어요."); reload();
  };
  const close = async (closed: boolean) => {
    if (!confirm(closed ? `${sunday} 주를 마감할까요? 마감하면 그 주 수입·지출·검증시트를 고칠 수 없어요.` : `${sunday} 주 마감을 풀까요?`)) return;
    setBusy(true); setErr(""); setMsg("");
    const { error } = await sb.rpc("set_week_closed", { p_sunday: sunday, p_closed: closed });
    setBusy(false);
    if (error) return setErr(dbError(error));
    reload();
  };

  const field = (label: string, value: string, set: (s: string) => void, hint?: React.ReactNode) => (
    <tr className="border-t">
      <td className="px-4 py-2 text-label">{label}</td>
      <td className="px-4 py-1 text-right">
        <input className={`${input} w-40 text-right print:border-0`} inputMode="numeric" value={value} disabled={d.closed}
          onChange={(e) => set(e.target.value.replace(/[^\d-]/g, "") ? won(toAmount(e.target.value)) : "")} />
      </td>
      <td className="px-4 text-xs text-muted">{hint}</td>
    </tr>
  );
  const calc = (label: string, value: number, how: string, strong = false) => (
    <tr className={`border-t ${strong ? "bg-surface-2 font-semibold" : ""}`}>
      <td className="px-4 py-2 text-label">{label}</td><td className="px-4 text-right text-heading">{won(value)}</td><td className="px-4 text-xs text-muted">{how}</td>
    </tr>
  );

  return (
    <>
      {err && <Notice kind="error">{err}</Notice>}
      {msg && <Notice>{msg}</Notice>}
      {d.closed && <Notice kind="warn">마감된 주예요. 고치려면 관리자가 마감을 풀어야 해요.</Notice>}
      <div className={`${card} p-6 print:p-0`}>
        <h2 className="mb-1 text-center text-lg font-bold">검증 시트</h2>
        <div className="mb-3 text-center text-sm text-label">{sunday} 주일 기준</div>
        <table className="mx-auto w-full max-w-3xl text-sm">
          <tbody>
            {field("A 통장 잔액", a, setA, "농협 통장 잔액")}
            {field("B 입금 예정", b, setB)}
            {calc("C 실잔액", c.realBalance, "A + B")}
            {field("D 해외선교 미입금", dd, setD, !d.closed && (
              <button className="no-print text-primary underline" onClick={() => setD(won(d.separate))}>별도 기금 장부잔액 {won(d.separate)} 넣기</button>
            ))}
            {calc("E 계좌 잔액", c.accountBalance, "C − D")}
            {calc("F 장부 잔액 누계", i.ledgerBalance, "이월금 + 수입 − 지출 (일반+특별)")}
            {calc("G 유용 가능", c.available, "E − F")}
            {field("H 기준 잉여금", h, setH, s?.base_surplus == null && d.lastH != null ? "지난 검증의 값을 불러왔어요" : "전년 이월")}
            <tr className="border-t-2 border-line">
              <td className="px-4 py-3 font-semibold text-heading">G − H</td>
              <td className="px-4 text-right text-base font-bold text-heading">{won(c.diff)}</td>
              <td className="px-4"><Badge label={v.label} />{v.amount > 0 && <span className="ml-2 text-xs text-label">{won(v.amount)}원 {v.label}</span>}</td>
            </tr>
          </tbody>
        </table>
        <div className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center gap-2 text-sm">
          <input className={`${input} min-w-0 flex-1 print:border-0`} placeholder="메모" value={note} disabled={d.closed} onChange={(e) => setNote(e.target.value)} />
          {!d.closed && <button className={`${btnPrimary} no-print`} disabled={busy} onClick={save}>{busy ? "처리 중…" : "저장"}</button>}
          {d.admin && (d.closed
            ? <button className={`${btn} no-print`} disabled={busy} onClick={() => close(false)}>마감 해제</button>
            : <button className={`${btn} no-print`} disabled={busy} onClick={() => close(true)}>이 주 마감</button>)}
        </div>
        {!d.admin && <p className="no-print mx-auto mt-2 max-w-3xl text-xs text-muted">주 마감·마감 해제는 관리자만 할 수 있어요.</p>}
        <p className="no-print mx-auto mt-2 max-w-3xl text-xs text-muted">G − H가 0보다 크면 &apos;초과&apos;로 표시해요. 원본에는 일치·부족만 있어요 [확인 필요]. 장부 지출에는 송금 수수료도 넣었어요 [확인 필요].</p>
      </div>
    </>
  );
}
