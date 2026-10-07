"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import { ExcelButton, PrintButton, btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { supabaseBrowser } from "@/lib/supabase/client";
import { currentSunday } from "@/lib/demo";
import { fileName, won } from "@/lib/format";
import { downloadXlsx } from "@/lib/excel";
import { fetchAll, loadFundBalances, loadTitles, saveTitles } from "@/lib/expense/db";
import { groupOfferings, separateLines, weekSummary, type FundBalance } from "@/lib/expense/report";
import { isSunday, koDate, sundayOf } from "@/lib/expense/week";

type Loan = { id: number; lender: string | null; principal: number | null; memo: string | null };
type Inc = { offering_type: string; member_name: string | null; payer_label: string | null; amount: number; memo: string | null; sunday: string };
type Exp = { id: number; sunday: string; content: string; amount: number; fee: number | null; department: string | null; item: string; memo: string | null; requester_label: string | null; fund_kind: string | null };
type Data = { sunday: string; funds: FundBalance[]; titles: string[]; loans: Loan[]; special: Inc[]; expenses: Exp[]; sepIn: Inc[]; sepOut: Exp[]; sepNames: string[] };

const th = "border border-line bg-surface-2 px-2 py-1 text-center font-semibold";
const td = "border border-line px-2 py-1";
const num = `${td} text-right`;
const H = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1 mt-5 font-bold text-heading">{children}</h3>;

export default function WeeklyReport() {
  return <DbOnly what="금주 수입/지출 리포트"><Screen /></DbOnly>;
}

function Screen() {
  const [sunday, setSunday] = useState(currentSunday);
  const q = useDbQuery(async (sb): Promise<Data> => {
    const year = sunday.slice(0, 4);
    const [funds, titles, loans, special, expenses, sepIn, sepOut, sepTypes] = await Promise.all([
      loadFundBalances(sb, sunday),
      loadTitles(sb),
      sb.from("loan").select("id, lender, principal, memo").order("id").then(must),
      sb.from("v_income").select("offering_type, member_name, payer_label, amount, memo, sunday").eq("sunday", sunday).eq("fund_kind", "special").order("type_order").order("id").then(must),
      sb.from("v_expense").select("id, sunday, content, amount, fee, department, item, memo, requester_label, fund_kind").eq("sunday", sunday).order("id").then(must),
      fetchAll<Inc>((a, b) => sb.from("v_income").select("offering_type, member_name, payer_label, amount, memo, sunday").eq("year", year).lte("sunday", sunday).eq("fund_kind", "separate").order("id").range(a, b)),
      fetchAll<Exp>((a, b) => sb.from("v_expense").select("id, sunday, content, amount, fee, department, item, memo, requester_label, fund_kind").eq("year", year).lte("sunday", sunday).eq("fund_kind", "separate").order("id").range(a, b)),
      sb.from("offering_type").select("name, sort_order, fund!inner(kind)").eq("fund.kind", "separate").order("sort_order").then(must),
    ]);
    return {
      sunday, funds, titles, loans: loans as Loan[], special: special as Inc[], expenses: expenses as Exp[], sepIn, sepOut,
      sepNames: (sepTypes as { name: string }[]).map((t) => t.name),
    };
  }, [sunday]);
  const d = q.data?.sunday === sunday ? q.data : null;

  const pick = (v: string) => { if (v) setSunday(isSunday(v) ? v : sundayOf(v)); };
  return (
    <>
      <PageHeader actions={<><ExcelButton onClick={() => d && excel(d)} disabled={!d} /><PrintButton /></>} />
      <div className={`${card} no-print mb-4 flex flex-wrap items-end gap-3 p-4 text-sm`}>
        <label className="text-xs text-label">주일
          <input type="date" value={sunday} onChange={(e) => pick(e.target.value)} className={`${input} mt-1 block`} />
        </label>
        {d && <TitleEditor key={d.titles.join("|")} titles={d.titles} onSaved={q.reload} />}
      </div>
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      {!d && !q.error && <div className="text-sm text-muted">불러오는 중…</div>}
      {d && <Report d={d} />}
    </>
  );
}

// 결재란 직함: 화면에서 바꾸고 app_setting 에 저장
function TitleEditor({ titles, onSaved }: { titles: string[]; onSaved: () => void }) {
  const [xs, setXs] = useState(titles);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const changed = xs.join("|") !== titles.join("|");
  const save = async () => {
    const clean = xs.map((x) => x.trim()).filter(Boolean);
    if (!clean.length) return setErr("직함을 하나 이상 넣어 주세요.");
    try { await saveTitles(supabaseBrowser()!, clean); setErr(""); setOpen(false); onSaved(); } catch (e) { setErr(dbError(e)); }
  };
  if (!open) return <button className={`${btn} ml-auto`} onClick={() => setOpen(true)}>결재란 직함 바꾸기</button>;
  return (
    <div className="ml-auto flex flex-wrap items-center gap-1">
      {xs.map((x, i) => (
        <span key={i} className="flex items-center">
          <input className={`${input} w-24`} value={x} onChange={(e) => setXs(xs.map((y, j) => (j === i ? e.target.value : y)))} />
          <button className="px-1 text-xs text-danger" title="빼기" onClick={() => setXs(xs.filter((_, j) => j !== i))}>×</button>
        </span>
      ))}
      {xs.length < 6 && <button className={btn} onClick={() => setXs([...xs, ""])}>칸 추가</button>}
      <button className={btnPrimary} disabled={!changed} onClick={save}>저장</button>
      <button className={btn} onClick={() => { setXs(titles); setOpen(false); setErr(""); }}>취소</button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}

function model(d: Data) {
  const { lines, total } = weekSummary(d.funds);
  const offerings = groupOfferings(d.special.map((s) => ({ type: s.offering_type, name: s.member_name ?? s.payer_label ?? "", amount: Number(s.amount), memo: s.memo })));
  const expenses = d.expenses.filter((e) => e.fund_kind !== "separate");
  const sep = separateLines(d.sepNames,
    d.sepIn.map((i) => ({ name: i.offering_type, amount: Number(i.amount), thisWeek: i.sunday === d.sunday })),
    d.sepOut.map((e) => ({ text: `${e.item} ${e.content} ${e.department ?? ""}`, amount: Number(e.amount) + Number(e.fee ?? 0), thisWeek: e.sunday === d.sunday })));
  const sepFund = d.funds.filter((f) => f.kind === "separate");
  return {
    lines, total, offerings, expenses, sep,
    showTransfer: [...lines, total].some((l) => l.transfer),
    loanTotal: d.loans.reduce((s, l) => s + Number(l.principal ?? 0), 0),
    expTotal: expenses.reduce((s, e) => s + Number(e.amount), 0),
    sepCarry: sepFund.reduce((s, f) => s + f.carry, 0),
    sepBalance: sepFund.reduce((s, f) => s + f.balance, 0),
    sepWeek: d.sepOut.filter((e) => e.sunday === d.sunday),
  };
}

function Report({ d }: { d: Data }) {
  const m = useMemo(() => model(d), [d]);
  const year = d.sunday.slice(0, 4);
  return (
    <div className={`${card} mx-auto max-w-[210mm] p-8 text-[13px] print:max-w-none print:p-0`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-heading">금주 수입·지출 보고</h2>
          <div className="mt-1 text-label">{koDate(d.sunday)} 주일</div>
        </div>
        <table className="border-collapse text-xs">
          <tbody>
            <tr><th rowSpan={2} className={`${th} w-6 leading-tight`}>결<br />재</th>{d.titles.map((t, i) => <th key={i} className={`${th} w-16`}>{t}</th>)}</tr>
            <tr>{d.titles.map((_, i) => <td key={i} className={`${td} h-12`} />)}</tr>
          </tbody>
        </table>
      </div>

      <H>1. 수입·지출</H>
      <table className="w-full border-collapse">
        <thead><tr>
          <th className={th}>구분</th><th className={th}>지난주 잔액(A)</th><th className={th}>이번 주 수입(B)</th><th className={th}>이번 주 지출(C)</th>
          {m.showTransfer && <th className={th}>회계 간 대체</th>}<th className={th}>잔액(A+B−C)</th>
        </tr></thead>
        <tbody>
          {[...m.lines, m.total].map((l) => (
            <tr key={l.label} className={l.label === "합계" ? "bg-surface-2 font-semibold" : ""}>
              <td className={`${td} text-center`}>{l.label}</td><td className={num}>{won(l.prev)}</td><td className={num}>{won(l.income)}</td><td className={num}>{won(l.expense)}</td>
              {m.showTransfer && <td className={num}>{won(l.transfer)}</td>}<td className={`${num} font-semibold`}>{won(l.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="no-print mt-1 text-xs text-muted">잔액 = {year}년 이월금 + {year}년 누계 수입 − 지출(송금 수수료 포함). 별도 기금(해외선교·네팔)은 아래에 따로 [확인 필요].</p>

      <H>2. 차입 현황</H>
      <table className="w-full border-collapse">
        <thead><tr><th className={th}>차입처</th><th className={th}>금액</th><th className={th}>비고</th></tr></thead>
        <tbody>
          {d.loans.map((l) => <tr key={l.id}><td className={td}>{l.lender}</td><td className={num}>{won(Number(l.principal ?? 0))}</td><td className={td}>{l.memo}</td></tr>)}
          {!d.loans.length && <tr><td className={`${td} text-center text-muted`} colSpan={3}>차입 없음</td></tr>}
          {d.loans.length > 1 && <tr className="bg-surface-2 font-semibold"><td className={td}>합계</td><td className={num}>{won(m.loanTotal)}</td><td className={td} /></tr>}
        </tbody>
      </table>
      <p className="no-print mt-1 text-xs text-muted">차입은 원금만 기록돼 있어요(상환 내역 없음) [확인 필요].</p>

      <H>3. 특별헌금 내역</H>
      <table className="w-full border-collapse">
        <thead><tr><th className={`${th} w-28`}>구분</th><th className={th}>이름</th><th className={`${th} w-32`}>금액</th></tr></thead>
        <tbody>
          {m.offerings.map((g) => (
            <tr key={g.type}>
              <td className={`${td} text-center`}>{g.type}</td>
              <td className={td}>{g.rows.map((r) => `${r.name || "-"}${r.memo ? `(${r.memo})` : ""} ${won(r.amount)}`).join(", ")}</td>
              <td className={num}>{won(g.total)}</td>
            </tr>
          ))}
          {!m.offerings.length && <tr><td className={`${td} text-center text-muted`} colSpan={3}>이번 주 특별헌금 없음</td></tr>}
        </tbody>
      </table>

      <H>4. 지출 상세</H>
      <table className="w-full border-collapse">
        <thead><tr><th className={`${th} w-10`}>순번</th><th className={th}>내용</th><th className={`${th} w-28`}>금액</th><th className={th}>부서</th><th className={th}>항목</th><th className={th}>비고</th></tr></thead>
        <tbody>
          {m.expenses.map((e, i) => (
            <tr key={e.id}>
              <td className={`${td} text-center`}>{i + 1}</td><td className={td}>{e.content}</td><td className={num}>{won(Number(e.amount))}</td>
              <td className={td}>{e.department}</td><td className={td}>{e.item}</td><td className={td}>{[e.requester_label, e.memo].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}
          {!m.expenses.length && <tr><td className={`${td} text-center text-muted`} colSpan={6}>이번 주 지출 없음</td></tr>}
          <tr className="bg-surface-2 font-semibold"><td className={td} colSpan={2}>합계</td><td className={num}>{won(m.expTotal)}</td><td className={td} colSpan={3} /></tr>
        </tbody>
      </table>

      <H>5. 해외선교·네팔 (별도 기금)</H>
      <table className="w-full border-collapse">
        <thead><tr><th className={th}>구분</th><th className={th}>이번 주 수입</th><th className={th}>이번 주 지출</th><th className={th}>{year}년 누계 수입</th><th className={th}>{year}년 누계 지출</th></tr></thead>
        <tbody>
          {m.sep.map((s) => (
            <tr key={s.name}><td className={`${td} text-center`}>{s.name}</td><td className={num}>{won(s.weekIn)}</td><td className={num}>{won(s.weekOut)}</td><td className={num}>{won(s.yearIn)}</td><td className={num}>{won(s.yearOut)}</td></tr>
          ))}
          <tr className="bg-surface-2 font-semibold">
            <td className={`${td} text-center`}>잔액</td>
            <td className={td} colSpan={4}>이월금 {won(m.sepCarry)} + 수입 {won(m.sep.reduce((s, x) => s + x.yearIn, 0))} − 지출 {won(m.sep.reduce((s, x) => s + x.yearOut, 0))} = <b>{won(m.sepBalance)}</b></td>
          </tr>
        </tbody>
      </table>
      {m.sepWeek.length > 0 && (
        <table className="mt-2 w-full border-collapse">
          <thead><tr><th className={th}>이번 주 별도 기금 지출</th><th className={`${th} w-28`}>금액</th><th className={th}>항목</th><th className={th}>비고</th></tr></thead>
          <tbody>{m.sepWeek.map((e) => <tr key={e.id}><td className={td}>{e.content}</td><td className={num}>{won(Number(e.amount))}</td><td className={td}>{e.item}</td><td className={td}>{e.memo}</td></tr>)}</tbody>
        </table>
      )}
      <p className="no-print mt-1 text-xs text-muted">이월금은 별도 기금 하나로만 있어 해외선교·네팔 각각의 잔액은 따로 내지 않아요. 별도 기금 지출은 항목·내용에 &apos;네팔&apos;이 있으면 네팔, 아니면 해외선교로 나눠요 [확인 필요].</p>
    </div>
  );
}

function excel(d: Data) {
  const { lines, total, offerings, expenses, sep, expTotal, sepBalance } = model(d);
  const rows: (string | number)[][] = [
    [`금주 수입·지출 보고 (${d.sunday} 주일)`], [],
    ["결재", ...d.titles], [],
    ["1. 수입·지출"], ["구분", "지난주 잔액(A)", "이번 주 수입(B)", "이번 주 지출(C)", "회계 간 대체", "잔액"],
    ...[...lines, total].map((l) => [l.label, l.prev, l.income, l.expense, l.transfer, l.balance]), [],
    ["2. 차입 현황"], ["차입처", "금액", "비고"], ...d.loans.map((l) => [l.lender ?? "", Number(l.principal ?? 0), l.memo ?? ""]), [],
    ["3. 특별헌금 내역"], ["구분", "이름", "금액", "비고"], ...offerings.flatMap((g) => [...g.rows.map((r) => [g.type, r.name, r.amount, r.memo ?? ""]), [`${g.type} 소계`, "", g.total]]), [],
    ["4. 지출 상세"], ["순번", "내용", "금액", "부서", "항목", "비고"],
    ...expenses.map((e, i) => [i + 1, e.content, Number(e.amount), e.department ?? "", e.item, [e.requester_label, e.memo].filter(Boolean).join(" · ")]),
    ["합계", "", expTotal], [],
    ["5. 해외선교·네팔"], ["구분", "이번 주 수입", "이번 주 지출", "누계 수입", "누계 지출"], ...sep.map((s) => [s.name, s.weekIn, s.weekOut, s.yearIn, s.yearOut]),
    ["별도 기금 잔액", sepBalance],
  ];
  return downloadXlsx(fileName(`금주보고_${d.sunday.replace(/-/g, "").slice(2)}`, "xlsx"), [{ name: "금주보고", rows, header: 1, widths: [16, 26, 16, 16, 16, 20] }]);
}
