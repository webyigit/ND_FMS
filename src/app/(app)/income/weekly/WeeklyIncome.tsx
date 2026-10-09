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
import { FUNDS, NO_NAME, entryLabel, listedTypes, toGrid, weeklyReport, weeklySheets, type IncomeViewRow, type PriorRow } from "@/lib/income/report";
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
    .select("offering_type_id, offering_type, type_order, fund_kind, amount")
    .gte("sunday", `${sunday.slice(0, 4)}-01-01`).lt("sunday", sunday).order("sunday").order("offering_type_id").range(a, b)), [sunday]);

  const rep = useMemo(() => {
    if (!ref || !rows.data || !prior.data) return null;
    const rank = new Map(ref.members.map((m) => [m.id, m.displayRank]));
    return weeklyReport(rows.data, ref.offeringTypes, (id) => rank.get(id), prior.data);
  }, [ref, rows.data, prior.data]);
  const week = weeks.data?.find((w) => w.sunday === sunday);
  const err = refErr ?? weeks.error ?? rows.error ?? prior.error;

  return (
    <>
      <PageHeader printHidden actions={<>
        <ExcelButton disabled={!rep?.count} onClick={() => rep && downloadXlsx(fileName(`주일헌금_${sunday.replace(/-/g, "").slice(4)}`, "xlsx"), weeklySheets(rep, sunday))} />
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
        <div className={`${card} print-sheet mx-auto max-w-[210mm] p-6 text-sm print:max-w-none print:p-0`}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-heading">주일 헌금 현황</h2>
              <div className="mt-1 text-label">{longDate(sunday)} 주일</div>
              <div className="text-xs text-muted">{rep.count}건{week?.closed ? " · 마감된 주" : ""}</div>
            </div>
            {!!titles.data?.length && (
              <table className="border-collapse text-xs">
                <tbody>
                  <tr><th rowSpan={2} className={`${th} w-6 leading-tight`}>결<br />재</th>{titles.data.map((t, i) => <th key={i} className={`${th} w-16`}>{t}</th>)}</tr>
                  <tr>{titles.data.map((_, i) => <td key={i} className={`${td} h-12`} />)}</tr>
                </tbody>
              </table>
            )}
          </div>

          {rep.count === 0 && <Notice kind="warn">이 주일에 입력된 수입이 없어요.</Notice>}

          <table className="mb-6 w-full border-collapse">
            <thead><tr><th className={th}>기금</th><th className={th}>헌금구분</th><th className={th}>현금</th><th className={th}>이체</th><th className={th}>금주 합계</th><th className={th}>건수</th><th className={th}>전주까지 누계</th><th className={th}>올해 누계</th></tr></thead>
            <tbody>
              {FUNDS.map((f) => {
                const ts = rep.types.filter((t) => t.fund === f);
                return (
                  <Fragment key={f}>
                    {ts.map((t, i) => (
                      <tr key={t.id}>
                        {i === 0 && <td rowSpan={ts.length + 1} className={`${td} text-center font-semibold`}>{f}{f === "별도" && <div className="text-[11px] font-normal text-muted">합계 제외</div>}</td>}
                        <td className={td}>{t.name}{t.totalOnly && <span className="text-xs text-muted"> (총액)</span>}</td>
                        <td className={tdNum}>{amt(t.cash)}</td><td className={tdNum}>{amt(t.online)}</td><td className={`${tdNum} font-medium`}>{amt(t.total)}</td>
                        <td className={`${td} text-center`}>{t.count || ""}</td>
                        <td className={tdNum}>{amt(t.prev)}</td><td className={`${tdNum} font-medium`}>{amt(t.ytd)}</td>
                      </tr>
                    ))}
                    <tr className="bg-surface-2 font-semibold">
                      {ts.length === 0 && <td className={`${td} text-center`}>{f}</td>}
                      <td className={td}>{f} 소계</td>
                      <td className={tdNum}>{amt(rep.byFund[f].cash)}</td><td className={tdNum}>{amt(rep.byFund[f].online)}</td><td className={tdNum}>{amt(rep.byFund[f].total)}</td><td className={td} />
                      <td className={tdNum}>{amt(rep.byFund[f].prev)}</td><td className={tdNum}>{amt(rep.byFund[f].ytd)}</td>
                    </tr>
                  </Fragment>
                );
              })}
              <tr className="bg-primary-subtle font-bold">
                <td className={td} colSpan={2}>일반·특별 합계</td>
                <td className={tdNum}>{amt(rep.generalSpecial.cash)}</td><td className={tdNum}>{amt(rep.generalSpecial.online)}</td><td className={tdNum}>{amt(rep.generalSpecial.total)}</td><td className={td} />
                <td className={tdNum}>{amt(rep.generalSpecial.prev)}</td><td className={tdNum}>{amt(rep.generalSpecial.ytd)}</td>
              </tr>
              <tr className="font-semibold">
                <td className={td} colSpan={2}>총계 (별도 포함)</td>
                <td className={tdNum}>{amt(rep.grand.cash)}</td><td className={tdNum}>{amt(rep.grand.online)}</td><td className={tdNum}>{amt(rep.grand.total)}</td>
                <td className={`${td} text-center`}>{rep.count}</td>
                <td className={tdNum}>{amt(rep.grand.prev)}</td><td className={tdNum}>{amt(rep.grand.ytd)}</td>
              </tr>
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
                <table className="w-full table-fixed border-collapse">
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
          <p className="text-xs text-muted">● 이체(온라인) 입금. 별도 기금(해외선교·네팔)은 일반·특별 합계에 넣지 않아요. 올해 누계 = 1월 1일부터 전주까지 누계 + 금주 합계.</p>
        </div>
      )}
    </>
  );
}
