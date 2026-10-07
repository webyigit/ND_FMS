"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import YearSelect from "@/components/ui/YearSelect";
import { ExcelButton, PrintButton, btn, card, input } from "@/components/ui/Buttons";
import { useDbQuery } from "@/lib/db/useDb";
import { downloadXlsx } from "@/lib/excel";
import { fileName, thisYear, won } from "@/lib/format";
import { fetchAll } from "@/lib/income/db";
import {
  MONTHS, filterByName, householdTotals, personKey, personSheet, personTotals, sumSelected, typeMonthMatrix, type PersonAggRow, type PersonTotal,
} from "@/lib/income/report";
import { amt, td, tdNum, th } from "../_ui/sheet";

// 개인별 헌금현황: 연도·헌금구분·이름으로 찾고, 여러 명(가족) 합계로 기부금영수증 발행 조건을 확인한다
export default function PersonOfferings() {
  const [year, setYear] = useState(thisYear);
  const [typeId, setTypeId] = useState(0);
  const [q, setQ] = useState("");
  const [family, setFamily] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<PersonTotal | null>(null);

  const data = useDbQuery((sb) => fetchAll<PersonAggRow>((a, b) => sb.from("v_income_person").select("*").eq("year", year)
    .order("member_id", { nullsFirst: false }).order("payer_label").order("offering_type_id").order("month").range(a, b)), [year]);

  const allTypes = useMemo(() => {
    const m = new Map<number, { id: number; name: string; order: number }>();
    (data.data ?? []).forEach((r) => m.set(r.offering_type_id, { id: r.offering_type_id, name: r.offering_type, order: r.type_order ?? 999 }));
    return [...m.values()].sort((a, b) => a.order - b.order);
  }, [data.data]);
  const rows = useMemo(() => (data.data ?? []).filter((r) => !typeId || r.offering_type_id === typeId), [data.data, typeId]);
  const types = typeId ? allTypes.filter((t) => t.id === typeId) : allTypes;
  const list = useMemo(() => {
    const ps = personTotals(rows);
    return filterByName(family ? householdTotals(ps) : ps, q);
  }, [rows, family, q]);
  const sel = sumSelected(list, selected);
  const grand = list.reduce((s, p) => s + p.total, 0);

  const detailRows = (p: PersonTotal) => rows.filter((r) => (p.key.startsWith("h") ? `h${r.household_id}` === p.key : personKey(r) === p.key));
  const matrix = detail ? typeMonthMatrix(detailRows(detail)) : null;

  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const excel = () => {
    const sheets = [personSheet(year, list, types, family), {
      name: "월별", header: 2, widths: [16, ...Array(12).fill(11), 13],
      rows: [[`${year}년 개인별 월별 합계`], ["이름", ...MONTHS, "합계"], ...list.map((p) => [p.name, ...p.byMonth, p.total])],
    }];
    downloadXlsx(fileName(`개인별헌금현황_${year}`, "xlsx"), sheets);
  };

  return (
    <>
      <PageHeader actions={<><ExcelButton disabled={!list.length} onClick={excel} /><PrintButton /></>} />
      <div className={`${card} no-print mb-4 flex flex-wrap items-end gap-3 p-3 text-sm`}>
        <label className="text-xs text-label">연도<div className="mt-1"><YearSelect value={year} onChange={(y) => { setYear(y); setSelected(new Set()); setDetail(null); }} /></div></label>
        <label className="text-xs text-label">헌금구분
          <select value={typeId} onChange={(e) => setTypeId(Number(e.target.value))} className={`${input} mt-1 block`}>
            <option value={0}>전체</option>
            {allTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-label">이름
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 검색" className={`${input} mt-1 block w-36`} />
        </label>
        <label className="flex items-center gap-1 pb-1.5"><input type="checkbox" checked={family} onChange={(e) => { setFamily(e.target.checked); setSelected(new Set()); setDetail(null); }} /> 가족 단위 합산</label>
        <span className="ml-auto pb-1.5 text-xs text-muted">주일헌금(총액 입력)은 개인별에 들어가지 않아요.</span>
      </div>
      {data.error && <Notice kind="error">불러오지 못했어요: {data.error}</Notice>}

      {selected.size > 0 && (
        <div className="no-print sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-primary-subtle px-4 py-2 text-sm">
          <b>선택 {sel.count}{family ? "가족" : "명"} 합계 {won(sel.total)}원</b>
          <span className="text-xs text-label">{types.filter((t) => sel.byType[t.id]).map((t) => `${t.name} ${won(sel.byType[t.id])}`).join(" · ")}</span>
          <span className="text-xs text-muted">{sel.names.join(", ")}</span>
          <span className="text-xs text-muted">기부금영수증 발행 기준 금액·대상은 [확인 필요]</span>
          <button onClick={() => setSelected(new Set())} className={`${btn} ml-auto`}>선택 해제</button>
        </div>
      )}

      {detail && matrix && (
        <div className={`${card} mb-4 p-4 text-sm`}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{detail.name} · {year}년 월별 내역{detail.members.length > 1 && <span className="text-xs font-normal text-muted"> ({detail.members.join(", ")})</span>}</h2>
            <button onClick={() => setDetail(null)} className={`${btn} no-print`}>닫기</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead><tr><th className={th}>헌금구분</th>{MONTHS.map((m) => <th key={m} className={th}>{m}</th>)}<th className={th}>합계</th></tr></thead>
              <tbody>
                {matrix.types.map((t) => <tr key={t.id}><td className={td}>{t.name}</td>{t.months.map((v, i) => <td key={i} className={tdNum}>{amt(v)}</td>)}<td className={`${tdNum} font-semibold`}>{amt(t.total)}</td></tr>)}
                <tr className="bg-surface-2 font-semibold"><td className={td}>합계</td>{matrix.monthTotals.map((v, i) => <td key={i} className={tdNum}>{amt(v)}</td>)}<td className={tdNum}>{amt(matrix.total)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.loading ? <div className="text-sm text-muted">불러오는 중…</div> : (
        <div className={`${card} overflow-x-auto p-4 text-sm print:p-0`}>
          <h2 className="mb-2 hidden text-center text-lg font-bold print:block">{year}년 개인별 헌금현황{family ? " (가족 합산)" : ""}</h2>
          <div className="no-print mb-2 text-xs text-muted">{list.length}{family ? "가족·개인" : "명"} · 합계 {won(grand)}원 · 이름을 누르면 월별 내역</div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th} no-print w-8`}>
                  <input type="checkbox" aria-label="모두 선택" checked={list.length > 0 && list.every((p) => selected.has(p.key))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(list.map((p) => p.key)) : new Set())} />
                </th>
                <th className={th}>{family ? "가족/이름" : "이름"}</th>
                {types.map((t) => <th key={t.id} className={th}>{t.name}</th>)}
                <th className={th}>합계</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.key} className={selected.has(p.key) ? "bg-primary-subtle/50" : ""}>
                  <td className={`${td} no-print text-center`}><input type="checkbox" checked={selected.has(p.key)} onChange={() => toggle(p.key)} /></td>
                  <td className={td}>
                    <button onClick={() => setDetail(p)} className="text-left text-heading hover:text-primary">{p.name}</button>
                    {p.memberId == null && !p.key.startsWith("h") && <span className="ml-1 text-[11px] text-muted">미등록</span>}
                    {family && p.members.length > 1 && <div className="text-[11px] text-muted">{p.members.join(", ")}</div>}
                  </td>
                  {types.map((t) => <td key={t.id} className={tdNum}>{amt(p.byType[t.id])}</td>)}
                  <td className={`${tdNum} font-semibold`}>{amt(p.total)}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={types.length + 3} className={`${td} py-6 text-center text-muted`}>내역이 없어요.</td></tr>}
            </tbody>
            {list.length > 0 && (
              <tfoot>
                <tr className="bg-surface-2 font-semibold">
                  <td className={`${td} no-print`} /><td className={td}>합계</td>
                  {types.map((t) => <td key={t.id} className={tdNum}>{amt(list.reduce((s, p) => s + (p.byType[t.id] ?? 0), 0))}</td>)}
                  <td className={tdNum}>{amt(grand)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </>
  );
}
