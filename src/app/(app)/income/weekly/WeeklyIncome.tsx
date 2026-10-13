"use client";
import { Fragment, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import { ExcelButton, PrintButton, card, input } from "@/components/ui/Buttons";
import TitleEditor from "@/components/ui/TitleEditor";
import { INCOME_TITLES, loadTitles, saveTitles } from "@/lib/expense/db";
import { supabaseBrowser } from "@/lib/supabase/client";
import { currentSunday } from "@/lib/demo";
import { useRefData } from "@/lib/db/refData";
import { must, useDbQuery } from "@/lib/db/useDb";
import { downloadXlsx } from "@/lib/excel";
import { fileName, won } from "@/lib/format";
import { isSunday } from "@/lib/income/dates";
import { fetchAll } from "@/lib/income/db";
import { NO_NAME, cumulativeWeeks, entryLabel, listedTypes, pct, progressReport, progressSheet, sundayIndex, toGrid, weeklyReport, weeklySheets, type IncomeViewRow, type PriorRow, type ProgressRow } from "@/lib/income/report";
import { loadChurch } from "@/lib/receipt/api";
import ProgressChart from "./ProgressChart";
import { amt, longDate, td, tdNum, th } from "../_ui/sheet";

type Week = { sunday: string; closed: boolean };
const TITLE_KEY = "income_approval_titles";

// 금주 수입내역: 원본 'MM-DD_주일헌금현황' 견본처럼 결재란 + 요약표 + 헌금종류별 (성명, 금액)×4 명단. A4 출력해 결재
export default function WeeklyIncome() {
  const { ref, error: refErr } = useRefData();
  const weeks = useDbQuery(async (sb) => must(await sb.from("week").select("sunday, closed").order("sunday", { ascending: false }).limit(260)) as Week[], []);
  const titles = useDbQuery((sb) => loadTitles(sb, TITLE_KEY, INCOME_TITLES), []);
  const [picked, setPicked] = useState<string | null>(null);
  // 고르기 전: 이번 주일. 이번 주 입력이 아직 없으면 가장 최근에 입력된 주일
  const sunday = picked ?? (weeks.data?.some((w) => w.sunday === currentSunday()) || !weeks.data?.length ? currentSunday() : weeks.data[0].sunday);
  const rows = useDbQuery((sb) => fetchAll<IncomeViewRow>((a, b) => sb.from("v_income")
    .select("id, sunday, offering_type_id, offering_type, type_order, fund_kind, member_id, member_name, payer_label, channel, amount, memo, bank_tx_id")
    .eq("sunday", sunday).order("id").range(a, b)), [sunday]);
  // 올해 1/1 ~ 전주 헌금구분별 합계 (누계용)
  const prior = useDbQuery((sb) => fetchAll<PriorRow>((a, b) => sb.from("v_income_week")
    .select("sunday, offering_type_id, offering_type, type_order, fund_kind, amount")
    .gte("sunday", `${sunday.slice(0, 4)}-01-01`).lt("sunday", sunday).order("sunday").order("offering_type_id").range(a, b)), [sunday]);
  const year = Number(sunday.slice(0, 4));
  // 헌금구분별 올해 예산(A) — 진도율용
  const budget = useDbQuery(async (sb) => must(await sb.from("budget").select("offering_type_id, amount").eq("year", year).not("offering_type_id", "is", null)) as { offering_type_id: number; amount: number }[], [year]);
  const church = useDbQuery(loadChurch, []);

  const rep = useMemo(() => {
    if (!ref || !rows.data || !prior.data) return null;
    const rank = new Map(ref.members.map((m) => [m.id, m.displayRank]));
    return weeklyReport(rows.data, ref.offeringTypes, (id) => rank.get(id), prior.data);
  }, [ref, rows.data, prior.data]);
  const secs = useMemo(() => {
    if (!rep) return [];
    const b = new Map<number, number>();
    (budget.data ?? []).forEach((r) => b.set(r.offering_type_id, (b.get(r.offering_type_id) ?? 0) + Number(r.amount)));
    return progressReport(rep, (id) => b.get(id) ?? 0);
  }, [rep, budget.data]);
  const general = secs.find((s) => s.fund === "일반")?.total;
  const cum = useMemo(() => (rep && prior.data ? cumulativeWeeks(prior.data, sunday, rep.byFund.일반.total) : []), [rep, prior.data, sunday]);
  const pos = sundayIndex(sunday);
  const churchName = church.data?.name?.trim() || "남도교회";
  const week = weeks.data?.find((w) => w.sunday === sunday);
  const err = refErr ?? weeks.error ?? rows.error ?? prior.error ?? budget.error;

  return (
    <>
      <PageHeader printHidden actions={<>
        <ExcelButton disabled={!rep?.count} onClick={() => rep && downloadXlsx(fileName(`주일헌금_${sunday.replace(/-/g, "").slice(4)}`, "xlsx"), [progressSheet(rep, secs, sunday, `대한예수교장로회 ${churchName}`), ...weeklySheets(rep, sunday)])} />
        <PrintButton />
      </>} />
      <div className={`${card} no-print mb-4 flex flex-wrap items-end gap-3 p-3 text-sm`}>
        <label className="text-xs text-label">주일
          <select value={sunday} onChange={(e) => setPicked(e.target.value)} className={`${input} mt-1 block`}>
            {!weeks.data?.some((w) => w.sunday === sunday) && <option value={sunday}>{sunday} (입력 없음)</option>}
            {(weeks.data ?? []).map((w) => <option key={w.sunday} value={w.sunday}>{w.sunday}{w.closed ? " · 마감" : ""}</option>)}
          </select>
        </label>
        <label className="text-xs text-label">날짜로 찾기
          <input type="date" value={sunday} onChange={(e) => isSunday(e.target.value) && setPicked(e.target.value)} className={`${input} mt-1 block`} />
        </label>
        <span className="text-xs text-muted">주일(일요일)만 고를 수 있어요. 이름 순서는 지정 순위 먼저, 나머지 가나다순.</span>
        {titles.data && <TitleEditor key={titles.data.join("|")} titles={titles.data} onSave={(xs) => saveTitles(supabaseBrowser()!, xs, TITLE_KEY)} onSaved={titles.reload} />}
      </div>
      {err && <Notice kind="error">불러오지 못했어요: {err}</Notice>}
      {!!rep?.noName && (
        <div className="no-print mb-4"><Notice kind="warn">
          이 주는 {won(rep.noName)}원이 개인내역 없이 합계로만 들어와 있어요(과거 장부 이관분). 명단에는 &lsquo;{NO_NAME}&rsquo;으로 나와요.
        </Notice></div>
      )}

      {!rep ? <div className="text-sm text-muted">불러오는 중…</div> : (
        <div className="sheet-scroll"><div className={`${card} sheet print-sheet mx-auto max-w-[210mm] p-6 text-sm print:max-w-none print:p-0`}>
          <div className="mb-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              {/* 원본 시트의 교단 휘장 */}
              <img src="/church-emblem.png" alt="교단 휘장" className="h-14 w-auto print:h-12" />
              <div className="leading-tight"><div className="text-xs text-label">대한예수교장로회</div><div className="text-lg font-bold tracking-[0.3em] text-heading">{churchName}</div></div>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-[0.2em] text-heading underline decoration-double underline-offset-4">주일 헌금 현황</h2>
              <div className="mt-1 text-label">{longDate(sunday)} 주일</div>
              <div className="text-xs text-muted">{rep.count}건{week?.closed ? " · 마감된 주" : ""}</div>
            </div>
            {!!titles.data?.length && (
              <table className="justify-self-center border-collapse text-xs sm:justify-self-end">
                <tbody>
                  <tr><th rowSpan={2} className={`${th} w-6 leading-tight`}>결<br />재</th>{titles.data.map((t, i) => <th key={i} className={`${th} w-16`}>{t}</th>)}</tr>
                  <tr>{titles.data.map((_, i) => <td key={i} className={`${td} h-12`} />)}</tr>
                </tbody>
              </table>
            )}
          </div>

          {rep.count === 0 && <Notice kind="warn">이 주일에 입력된 수입이 없어요.</Notice>}

          {/* 원본 상단 1: 일반회계 예산 대비 */}
          {general && (
            <table className="tbl-cards mb-2 w-full border-collapse">
              <thead><tr><th className={th}>구분</th><th className={th}>{year}년 예산액(A)</th><th className={th}>이번 주 헌금액</th><th className={th}>지난주 누계액</th><th className={th}>{year}년 총누계액(B)</th><th className={th}>{year}년 진도율(%)(B/A)</th></tr></thead>
              <tbody><tr className="font-semibold">
                <td className={`${td} text-center`}>일반회계</td>
                <td className={tdNum}>{amt(general.budget)}</td><td className={tdNum}>{amt(general.week)}</td><td className={tdNum}>{amt(general.prev)}</td><td className={tdNum}>{amt(general.ytd)}</td>
                <td className={tdNum}><Rate r={general.rate} /></td>
              </tr></tbody>
            </table>
          )}
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div className="font-semibold">이번주헌금 <span className="text-xs font-normal text-label">(일반+특별)</span> <span className="ml-2 text-base">{won(rep.generalSpecial.total)}원</span>
              <span className="ml-2 text-xs font-normal text-muted">현금 {won(rep.generalSpecial.cash)} · 이체 {won(rep.generalSpecial.online)}</span></div>
            <div className="text-xs text-muted">올해 {pos.index}/{pos.total}번째 주일 · 경과율 {(pos.index / pos.total * 100).toFixed(2)}%</div>
          </div>

          {/* 원본 상단 2: 회계 › 구분 › 항목별 예산·이번 주·지난주까지·총누계·진도율 */}
          <table className="tbl-cards mb-6 w-full border-collapse">
            <colgroup><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[14%]" /><col /><col /><col /><col /><col className="w-[15%]" /></colgroup>
            <thead><tr><th className={th}>회계</th><th className={th}>구분</th><th className={th}>항목</th><th className={th}>{year}예산(A)</th><th className={th}>이번 주</th><th className={th}>지난주까지</th><th className={th}>총누계(B)</th><th className={th}>진도율(%)(B/A)</th></tr></thead>
            <tbody>
              {secs.map((s) => (
                <Fragment key={s.fund}>
                  <tr className={s.fund === "별도" ? "font-semibold" : "bg-surface-2 font-semibold"}>
                    <td rowSpan={s.rows.length + 1} className={`${td} text-center font-semibold`}>{s.label}{s.fund === "별도" && <div className="text-[11px] font-normal text-muted">합계 제외</div>}</td>
                    <td className={`${td} text-center`} colSpan={2}>합　계</td>
                    <ProgressCells r={s.total} />
                  </tr>
                  {s.rows.map((r, i) => (
                    <tr key={r.item}>
                      {(i === 0 || s.rows[i - 1].group !== r.group) && <td rowSpan={s.rows.slice(i).findIndex((x) => x.group !== r.group) === -1 ? s.rows.length - i : s.rows.slice(i).findIndex((x) => x.group !== r.group)} className={`${td} text-center`}>{r.group}</td>}
                      <td className={`${td} whitespace-nowrap`}>{r.item}</td>
                      <ProgressCells r={r} />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>

          <h3 className="mb-2 font-bold text-heading">헌금 명단</h3>
          {listedTypes(rep).map((t) => (
            <section key={t.id} className="mb-4 break-inside-avoid">
              <div className="mb-1 flex justify-between font-semibold">
                <span>{t.name} <span className="text-xs font-normal text-muted">[{t.fund}]</span></span>
                <span>{t.totalOnly ? "총액" : `${t.count}건`} · {won(t.total)}원</span>
              </div>
              {!t.totalOnly && (
                <ul className="grid grid-cols-2 gap-x-3 text-sm sm:hidden print:hidden">
                  {t.entries.map((e, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2 border-b border-line py-0.5" title={entryLabel(e)}>
                      <span className="min-w-0 truncate">{e.name}{e.memo && <span className="text-xs text-muted">({e.memo})</span>}{e.channel === "online" && <span className="ml-0.5 text-[10px] text-info" title="이체">●</span>}</span>
                      <span className="shrink-0 tabular-nums">{won(e.amount)}</span>
                    </li>
                  ))}
                  {!!t.noName && <li className="col-span-2 flex justify-between border-b border-line py-0.5"><span className="text-muted">{NO_NAME}</span><span className="tabular-nums">{won(t.noName)}</span></li>}
                </ul>
              )}
              {!t.totalOnly && (
                <table className="hidden w-full table-fixed border-collapse sm:table print:table">
                  <colgroup>{[0, 1, 2, 3].map((i) => <Fragment key={i}><col className="w-[15%]" /><col className="w-[10%]" /></Fragment>)}</colgroup>
                  <thead><tr>{[0, 1, 2, 3].map((i) => <Fragment key={i}><th className={th}>성명</th><th className={th}>금액</th></Fragment>)}</tr></thead>
                  <tbody>
                    {toGrid(t.entries).map((row, i) => (
                      <tr key={i}>
                        {row.map((e, j) => (
                          <Fragment key={j}>
                            <td className={`${td} break-words`} title={e ? entryLabel(e) : ""}>
                              {e && <>{e.name}{e.memo && <span className="text-xs text-muted">({e.memo})</span>}{e.channel === "online" && <span className="ml-0.5 text-[10px] text-info" title="이체">●</span>}</>}
                            </td>
                            <td className={tdNum}>{e ? won(e.amount) : ""}</td>
                          </Fragment>
                        ))}
                      </tr>
                    ))}
                    {!!t.noName && (
                      <tr><td className={`${td} text-muted`} colSpan={7}>{NO_NAME}</td><td className={tdNum}>{won(t.noName)}</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </section>
          ))}
          <p className="text-xs text-muted">● 이체(온라인) 입금. 별도 기금(해외선교·네팔)은 일반·특별 합계에 넣지 않아요. 총누계(B) = 1월 1일부터 지난주까지 + 이번 주. 진도율 = 총누계 ÷ 올해 예산.</p>
        </div></div>
      )}
      {rep && general && cum.length > 1 && (
        <div className={`${card} no-print mx-auto mt-4 max-w-[210mm] p-4`}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold text-heading">일반회계 누계 추이</h3>
            <span className="text-xs text-muted">예산 {won(general.budget)}원 · 진도율 {pct(general.rate)}% · 경과율 {(pos.index / pos.total * 100).toFixed(2)}%</span>
          </div>
          <ProgressChart weeks={cum} budget={general.budget} totalSundays={pos.total} />
        </div>
      )}
    </>
  );
}

/** 진도율: 숫자 + 막대(100% 넘으면 강조) */
function Rate({ r }: { r: number | null }) {
  if (r == null || r === 0) return <>-</>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-surface-2 sm:inline-block print:inline-block print:border print:border-line">
        <span className={`block h-full ${r >= 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${Math.min(r, 100)}%` }} />
      </span>
      <span className={r >= 100 ? "font-semibold text-success" : ""}>{pct(r)}</span>
    </span>
  );
}

function ProgressCells({ r }: { r: ProgressRow }) {
  return (<>
    <td className={tdNum}>{amt(r.budget)}</td><td className={`${tdNum} font-medium`}>{amt(r.week)}</td><td className={tdNum}>{amt(r.prev)}</td>
    <td className={`${tdNum} font-medium`}>{amt(r.ytd)}</td><td className={tdNum}><Rate r={r.rate} /></td>
  </>);
}
