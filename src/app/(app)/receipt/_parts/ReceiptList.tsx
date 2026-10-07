"use client";
// 발행현황·지난 발행내역 공용: 연도별 목록, 검색, 기부금 관리대장(엑셀·출력), 보기·수정·재발행·취소
import { useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import YearSelect from "@/components/ui/YearSelect";
import { ExcelButton, PrintButton, btn, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { downloadXlsx } from "@/lib/excel";
import { fileName, thisYear, won } from "@/lib/format";
import { cancelReceipt, RECEIPT_COLS, type ReceiptView } from "@/lib/receipt/api";
import { LEDGER_HEAD, STATUS_LABEL, ledgerRows, ledgerTotal, matchReceipt, type ReceiptStatus } from "@/lib/receipt/ledger";
import { supabaseBrowser } from "@/lib/supabase/client";
import ReceiptPreview from "./ReceiptPreview";

const ALL = 0;

export default function ReceiptList({ mode }: { mode: "status" | "past" }) {
  return <DbOnly what="발행 목록"><List mode={mode} /></DbOnly>;
}

function List({ mode }: { mode: "status" | "past" }) {
  const sb = supabaseBrowser();
  const latest = thisYear() - 1; // 올해 발행하는 것은 지난해 기부분
  const [year, setYear] = useState(mode === "status" ? latest : ALL);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ReceiptStatus | "">("");
  const [view, setView] = useState<number[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const data = useDbQuery(async (s) => {
    let query = s.from("v_donation_receipt").select(RECEIPT_COLS).order("serial_no");
    if (year !== ALL) query = query.eq("year", year);
    else if (mode === "past") query = query.lt("year", latest);
    return must(await query) as ReceiptView[];
  }, [year, mode]);

  const rows = useMemo(() => (data.data ?? []).filter((r) => (!status || r.status === status) && matchReceipt(r, q)), [data.data, q, status]);
  const title = `${year === ALL ? (mode === "past" ? `~${latest - 1}년` : "전체") : `${year}년`} 기부금 관리대장`;

  const cancel = async (r: ReceiptView) => {
    if (!sb) return;
    const reason = prompt(`${r.serial_no} ${r.donor_name} 영수증을 취소할까요? 사유를 적어 주세요.`);
    if (!reason?.trim()) return;
    try { await cancelReceipt(sb, r.id, reason); setMsg({ ok: true, text: `${r.serial_no} 취소했어요.` }); data.reload(); }
    catch (e) { setMsg({ ok: false, text: `취소하지 못했어요: ${dbError(e)}` }); }
  };

  const excel = () => downloadXlsx(fileName(title.replace(/\s/g, "_"), "xlsx"), [{
    name: "기부금관리대장",
    rows: [[title], LEDGER_HEAD, ...ledgerRows(rows), ["합계(발행)", "", "", ledgerTotal(rows)]],
    widths: [18, 14, 20, 14, 12, 10], header: 2,
  }]);

  if (view) return <><div className="no-print"><PageHeader /></div><ReceiptPreview ids={view} onClose={() => setView(null)} /></>;

  return (
    <>
      <div className="no-print"><PageHeader actions={<><ExcelButton onClick={excel} disabled={!rows.length} /><PrintButton /></>} /></div>
      <div className={`${card} no-print mb-4 flex flex-wrap items-end gap-3 p-4`}>
        <label className="text-xs text-label">기부 연도<br />
          {mode === "past"
            ? <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={input}>
                <option value={ALL}>지난 연도 전체</option>
                {Array.from({ length: latest - 2015 }, (_, i) => latest - 1 - i).map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
            : <YearSelect value={year} onChange={setYear} to={thisYear()} />}
        </label>
        <label className="text-xs text-label">상태<br />
          <select value={status} onChange={(e) => setStatus(e.target.value as ReceiptStatus | "")} className={input}>
            <option value="">전체</option>
            {Object.entries(STATUS_LABEL).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="min-w-[240px] flex-1 text-xs text-label">검색 (이름·금액·주소·발행번호·주민번호 앞 6자리)<br />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 가나다, 1200000, 900101" className={`${input} w-full`} />
        </label>
        <Link href="/receipt/issue" className={btn}>새 영수증 발행</Link>
      </div>
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      {data.error && <Notice kind="error">불러오지 못했어요: {data.error}</Notice>}

      <h2 className="mb-2 hidden text-center text-lg font-bold print:block">{title}</h2>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr>
              <th className="px-3 py-2 text-left">발행번호</th><th className="text-left">성명(법인명)</th><th>주민번호(사업자번호)</th>
              <th className="text-left">주소</th><th className="text-right">발행금액</th><th>발행일</th><th>상태</th><th className="no-print w-48" />
            </tr>
          </thead>
          <tbody>
            {data.loading && <tr><td colSpan={8} className="px-3 py-4 text-center text-muted">불러오는 중…</td></tr>}
            {!data.loading && !rows.length && <tr><td colSpan={8} className="px-3 py-4 text-center text-muted">발행 내역이 없어요.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{r.serial_no}</td>
                <td className="text-heading">{r.donor_name}{r.split_ratio != null && <span className="text-xs text-muted"> ({Number(r.split_ratio)}%)</span>}</td>
                <td className="whitespace-nowrap text-center text-xs">{(r.donor_kind === "CP" ? r.donor_brn : r.donor_rrn_masked) ?? "-"}</td>
                <td className="max-w-[260px] truncate text-xs text-label">{r.donor_address}</td>
                <td className="text-right">{won(r.issued_amount)}</td>
                <td className="whitespace-nowrap text-center text-xs">{r.issued_at}</td>
                <td className="text-center"><span className={`rounded px-2 py-0.5 text-xs ${STATUS_LABEL[r.status]?.[1]}`}>{STATUS_LABEL[r.status]?.[0]}</span></td>
                <td className="no-print whitespace-nowrap px-2 text-right text-xs">
                  <button onClick={() => setView([r.id])} className="text-primary">보기</button>
                  {r.status === "issued" && <>
                    {" · "}<Link href={`/receipt/issue?edit=${r.id}`} className="text-primary">수정</Link>
                    {" · "}<Link href={`/receipt/issue?reissue=${r.id}`} className="text-primary">재발행</Link>
                    {" · "}<button onClick={() => cancel(r)} className="text-danger">취소</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-surface-2 font-semibold">
                <td className="px-3 py-2" colSpan={4}>{rows.length}건 · 합계(발행 상태만)</td>
                <td className="text-right">{won(ledgerTotal(rows))}</td><td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="no-print mt-3 text-xs text-muted">주민번호는 앞 6자리로만 찾을 수 있어요. 관리대장 엑셀·출력에도 주민번호는 가려서 나가요.</p>
    </>
  );
}
