"use client";
import { Fragment, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import YearSelect from "@/components/ui/YearSelect";
import { ExcelButton, PrintButton, btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { downloadXlsx } from "@/lib/excel";
import { fileName, thisYear, toAmount, won } from "@/lib/format";
import { wonOrDash } from "@/lib/reports/common";
import { copyPrevBudget, planGroups, planLines, planSig, toBudgetPayload, type PlanLine } from "@/lib/reports/budget";
import { loadApprovedRequests, loadBudgets, loadCarry, loadExpWeeks, loadFunds, loadIncWeeks, loadRefs, saveCarry } from "@/lib/reports/load";
import { td, tdr, th } from "../shared";

async function load(sb: SupabaseClient, year: number) {
  const [refs, budgets, prevBudgets, prevInc, prevExp, requests, funds, carry] = await Promise.all([
    loadRefs(sb), loadBudgets(sb, year), loadBudgets(sb, year - 1), loadIncWeeks(sb, year - 1, year - 1), loadExpWeeks(sb, year - 1, year - 1),
    loadApprovedRequests(sb, year), loadFunds(sb), loadCarry(sb, year),
  ]);
  return { year, lines: planLines({ ...refs, budgets, prevBudgets, prevInc, prevExp, requests }), funds, carry };
}

export default function BudgetPlan() {
  return <DbOnly what="내년도 예산"><Body /></DbOnly>;
}

function Body() {
  const sb = supabaseBrowser();
  const [year, setYear] = useState(thisYear() + 1);
  const q = useDbQuery((s) => load(s, year), [year]);
  const [lines, setLines] = useState<PlanLine[]>([]);
  const [savedSig, setSavedSig] = useState("");
  const [carry, setCarry] = useState<Record<number, string>>({});
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [carrySaved, setCarrySaved] = useState<Record<number, number>>({});
  // 새로 불러오면 편집 상태를 맞춘다(렌더 중 조정)
  const [src, setSrc] = useState<typeof q.data>(null);
  if (q.data && q.data !== src) {
    setSrc(q.data); setLines(q.data.lines); setSavedSig(planSig(q.data.lines)); setCarry({}); setCarrySaved({});
  }
  const dirty = planSig(lines) !== savedSig;
  const groups = useMemo(() => planGroups(lines), [lines]);
  const total = (kind: PlanLine["kind"], sep: boolean) => lines.filter((l) => l.kind === kind && (l.fund === "별도") === sep).reduce((s, l) => s + l.amount, 0);
  const incOp = total("income", false), expOp = total("expense", false);

  const changeYear = (y: number) => {
    if (dirty && !confirm("저장하지 않은 예산이 있어요. 버리고 다른 연도로 갈까요?")) return;
    setYear(y); setNote(null);
  };
  const setAmount = (key: string, v: number) => setLines((xs) => xs.map((x) => (x.key === key ? { ...x, amount: v } : x)));
  const copyPrev = () => {
    if (lines.some((l) => l.amount) && !confirm(`${year - 1}년 예산으로 모두 바꿀까요? (입력한 값은 사라져요)`)) return;
    setLines(copyPrevBudget(lines)); setNote({ ok: true, text: `${year - 1}년 예산을 복사했어요. 저장을 눌러야 반영돼요.` });
  };
  const save = async () => {
    if (!sb) return;
    setBusy(true); setNote(null);
    const { data, error } = await sb.rpc("save_budget", { p_year: year, p_rows: toBudgetPayload(lines) });
    setBusy(false);
    if (error) return setNote({ ok: false, text: `저장하지 못했어요: ${dbError(error)}` });
    setSavedSig(planSig(lines)); setNote({ ok: true, text: `${year}년 예산 ${data}줄을 저장했어요.` });
  };
  const saveCarryover = async (fundId: number) => {
    if (!sb || carry[fundId] == null) return;
    try {
      const v = toAmount(carry[fundId]);
      await saveCarry(sb, year, fundId, v);
      setCarrySaved((c) => ({ ...c, [fundId]: v }));
      setCarry((c) => { const n = { ...c }; delete n[fundId]; return n; });
      setNote({ ok: true, text: "이월금을 저장했어요." });
    } catch (e) { setNote({ ok: false, text: `이월금을 저장하지 못했어요: ${dbError(e)}` }); }
  };

  const excel = () => downloadXlsx(fileName(`예산_${year}`, "xlsx"), [
    { name: "수입 예산", widths: [10, 18, 16, 16, 16, 12], rows: [["기금", "헌금구분", `${year - 1} 예산`, `${year - 1} 실적`, `${year} 예산`, "증감"],
      ...lines.filter((l) => l.kind === "income").map((l) => [l.group, l.label, l.prevBudget, l.prevActual, l.amount, l.amount - l.prevBudget])] },
    { name: "지출 예산", widths: [14, 22, 16, 16, 16, 16, 12], rows: [["부서", "항목", `${year - 1} 예산`, `${year - 1} 실적`, "승인 신청", `${year} 예산`, "증감"],
      ...lines.filter((l) => l.kind === "expense").map((l) => [l.group, l.label, l.prevBudget, l.prevActual, l.requested, l.amount, l.amount - l.prevBudget])] },
  ]);

  const d = q.data?.year === year ? q.data : null; // 다른 연도 값이 잠깐 남아 있을 때 저장 막기
  return (
    <>
      <PageHeader actions={<><ExcelButton onClick={excel} disabled={!d} /><PrintButton /></>} />
      <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3 text-sm shadow-card">
        <YearSelect value={year} onChange={changeYear} to={thisYear() + 2} />
        <button className={btn} onClick={copyPrev} disabled={!d}>{year - 1}년 예산 복사</button>
        <button className={btnPrimary} onClick={save} disabled={!d || busy || !dirty}>{busy ? "저장 중…" : "저장"}</button>
        {dirty ? <span className="text-xs text-warning">저장하지 않은 변경이 있어요</span> : d && <span className="text-xs text-success">저장됨</span>}
      </div>
      {note && <Notice kind={note.ok ? "ok" : "error"}>{note.text}</Notice>}
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      {(q.loading || (q.data && !d)) && <div className="text-sm text-muted">불러오는 중…</div>}

      {d && (
        <div className={`${card} space-y-6 p-6 text-sm print:p-0`}>
          <h2 className="text-center text-lg font-bold">{year}년도 예산(안)</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {[["수입 예산(일반·특별)", incOp, "text-chart-in"], ["지출 예산(일반·특별)", expOp, "text-chart-out"], ["차이(수입−지출)", incOp - expOp, incOp - expOp < 0 ? "text-danger" : ""]].map(([l, v, c]) => (
              <div key={l as string} className="rounded-lg border border-line p-3 text-center"><div className="text-xs text-label">{l}</div><div className={`text-lg font-bold ${c}`}>{won(v as number)}</div></div>
            ))}
          </div>

          <section>
            <h3 className="mb-2 font-semibold">이월금 ({year - 1}년 → {year}년)</h3>
            <table className="w-full max-w-xl border-collapse">
              <thead><tr><th className={th}>기금</th><th className={th}>이월금</th><th className={`${th} no-print`} /></tr></thead>
              <tbody>{d.funds.map((f) => (
                <tr key={f.id}><td className={td}>{f.name}</td>
                  <td className={tdr}><input className={`${input} w-36 text-right`} inputMode="numeric" value={carry[f.id] ?? won(carrySaved[f.id] ?? d.carry.get(f.id) ?? 0)} onChange={(e) => setCarry((c) => ({ ...c, [f.id]: e.target.value }))} /></td>
                  <td className={`${td} no-print text-center`}><button className={btn} disabled={carry[f.id] == null} onClick={() => saveCarryover(f.id)}>저장</button></td></tr>
              ))}</tbody>
            </table>
            <p className="mt-1 text-xs text-muted">{year - 1}년 결산을 확정하면 자동으로 들어가요.</p>
          </section>

          {(["income", "expense"] as const).map((kind) => (
            <section key={kind} className={kind === "expense" ? "break-before-page" : ""}>
              <h3 className="mb-2 font-semibold">{kind === "income" ? "수입 예산 (헌금구분별)" : "지출 예산 (부서·항목별)"}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse">
                  <thead><tr>
                    <th className={th}>{kind === "income" ? "기금" : "부서"}</th><th className={th}>{kind === "income" ? "헌금구분" : "항목"}</th>
                    <th className={th}>{year - 1} 예산</th><th className={th}>{year - 1} 실적</th>
                    {kind === "expense" && <th className={th}>승인 신청</th>}
                    <th className={th}>{year} 예산</th><th className={th}>증감</th>
                  </tr></thead>
                  <tbody>{groups.filter((g) => g.kind === kind).map((g) => (
                    <Fragment key={g.group}>
                      {g.lines.map((l, i) => (
                        <tr key={l.key}>
                          <td className={td}>{i === 0 ? g.group : ""}</td><td className={td}>{l.label}</td>
                          <td className={`${tdr} text-label`}>{wonOrDash(l.prevBudget)}</td><td className={`${tdr} text-label`}>{wonOrDash(l.prevActual)}</td>
                          {kind === "expense" && <td className={tdr}>{l.requested ? <>{won(l.requested)} {l.requested !== l.amount && <button className="no-print ml-1 rounded border px-1 text-xs text-primary" onClick={() => setAmount(l.key, l.requested)}>반영</button>}</> : "-"}</td>}
                          <td className={`${tdr} p-0.5`}><input className={`${input} w-32 text-right`} inputMode="numeric" value={l.amount ? won(l.amount) : ""} placeholder="0" onChange={(e) => setAmount(l.key, Math.max(0, toAmount(e.target.value)))} /></td>
                          <td className={`${tdr} ${l.amount - l.prevBudget < 0 ? "text-danger" : ""}`}>{l.amount - l.prevBudget ? won(l.amount - l.prevBudget) : "-"}</td>
                        </tr>
                      ))}
                      <tr className="bg-surface-2 font-semibold"><td className={td} colSpan={2}>{g.group} 소계</td><td className={tdr}>{won(g.prevBudget)}</td><td className={tdr}>{won(g.prevActual)}</td>{kind === "expense" && <td className={tdr}>{wonOrDash(g.requested)}</td>}<td className={tdr}>{won(g.amount)}</td><td className={tdr}>{won(g.amount - g.prevBudget)}</td></tr>
                    </Fragment>
                  ))}</tbody>
                </table>
              </div>
            </section>
          ))}
          <p className="text-xs text-muted">승인 신청: 예산신청 중 승인된 금액. &lsquo;반영&rsquo;을 누르면 그 금액으로 바꿔요 [확인 필요: 신청액을 더할지 바꿀지]</p>
        </div>
      )}
    </>
  );
}
