"use client";
import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperclip } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import DbOnly from "@/components/ui/DbOnly";
import { ExcelButton, btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { useDbQuery, must } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { currentSunday } from "@/lib/demo";
import { downloadXlsx } from "@/lib/excel";
import { fileName, won } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useDeptItems } from "@/lib/work/me";
import { STATUS, type RequestStatus } from "@/lib/work/requests";
import { notifyRequestsChanged } from "@/lib/requests/pending";

/** 주소창 ?open=ID (상단 팝업에서 바로 온 신청) */
const openParam = () => { const v = Number(new URLSearchParams(window.location.search).get("open")); return v > 0 ? v : null; };

type Row = {
  id: number; status: RequestStatus; department_id: number | null; department: string | null; item: string | null;
  content: string; amount: number; used_at: string | null; requester_name: string | null; requested_at: string;
  reviewed_at: string | null; review_note: string | null; expense_sunday: string | null;
  bank: string | null; holder: string | null; account_masked: string | null; drive_file_id: string | null;
};
const TABS: { value: RequestStatus | ""; label: string }[] = [
  { value: "requested", label: "검토 중" }, { value: "approved", label: "승인" }, { value: "rejected", label: "반려" }, { value: "", label: "전체" },
];

export default function ExpenseRequests() {
  return <DbOnly what="지출신청 관리"><Inner /></DbOnly>;
}

// 신청관리 > 지출신청: 부서장·목회자 신청 확인 → 부서·항목·주일 지정 후 승인(지출로 들어감) / 반려(사유)
function Inner() {
  const sb = supabaseBrowser()!;
  const [tab, setTab] = useState<RequestStatus | "">("requested");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<number | null>(openParam);
  const focusRef = useRef<HTMLTableRowElement>(null);
  const q = useDbQuery(async (s) => {
    let r = s.from("v_expense_request").select("*").order("requested_at", { ascending: false }).limit(500);
    if (tab) r = r.eq("status", tab);
    return must(await r) as Row[];
  }, [tab]);
  const rows = q.data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  // 팝업에서 온 신청이 목록에 보이면 그 줄로 스크롤. 이미 처리된 신청이면 안내
  const missing = open !== null && !!q.data && !q.data.some((r) => r.id === open) && openParam() === open;
  useEffect(() => { if (q.data && open !== null) focusRef.current?.scrollIntoView({ block: "center" }); }, [q.data, open]);
  const finish = (text: string) => { setMsg({ ok: true, text }); setOpen(null); q.reload(); notifyRequestsChanged(); if (window.location.search) window.history.replaceState(null, "", "/requests/expense"); };

  const excel = () => downloadXlsx(fileName("지출신청", "xlsx"), [{
    name: "지출신청", widths: [11, 10, 12, 16, 28, 12, 11, 24, 8, 11, 20],
    rows: [["신청일", "신청자", "부서", "항목", "내용", "금액", "사용일", "송금 계좌", "상태", "지출 주일", "검토 메모"],
      ...rows.map((r) => [r.requested_at.slice(0, 10), r.requester_name, r.department, r.item, r.content, Number(r.amount), r.used_at,
        r.account_masked ? `${r.bank ?? ""} ${r.account_masked} ${r.holder ?? ""}`.trim() : "", STATUS[r.status][0], r.expense_sunday, r.review_note])],
  }]);

  return (
    <>
      <PageHeader actions={<ExcelButton onClick={excel} disabled={!rows.length} />} />
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      {missing && <Notice kind="warn">그 신청은 이미 처리됐거나 검토 중 목록에 없어요.</Notice>}
      {q.error && <Notice kind="error">{q.error}</Notice>}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {TABS.map((t) => (
          <button key={t.value} onClick={() => { setTab(t.value); setOpen(null); }} className={`rounded-full border px-3 py-1 ${tab === t.value ? "bg-primary text-white" : "bg-surface"}`}>{t.label}</button>
        ))}
        <span className="ml-auto text-label">{rows.length}건 · {won(total)}원</span>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="px-3 py-2 text-left">신청일</th><th className="text-left">신청자</th><th className="text-left">부서/항목</th><th className="text-left">내용</th>
              <th className="text-right">금액</th><th>사용일</th><th className="text-left">송금 계좌</th><th>영수증</th><th>상태</th><th className="w-20" /></tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={10} className="py-8 text-center text-muted">{q.loading ? "불러오는 중…" : "신청이 없어요"}</td></tr>}
            {rows.map((r) => (
              <Line key={r.id} r={r} open={open === r.id} toggle={() => setOpen(open === r.id ? null : r.id)} rowRef={open === r.id ? focusRef : undefined}
                done={finish} fail={(text) => setMsg({ ok: false, text })} sb={sb} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">승인하면 고른 주일의 지출(출처 &apos;신청&apos;, 청구자 = 신청자)로 들어가요. 주일 기본값은 승인하는 날 기준 이번 주일이에요. [확인 필요: 사용일 기준 주일로 넣을지]</p>
    </>
  );
}

function Line({ r, open, toggle, done, fail, sb, rowRef }: {
  r: Row; open: boolean; toggle: () => void; done: (t: string) => void; fail: (t: string) => void; sb: NonNullable<ReturnType<typeof supabaseBrowser>>;
  rowRef?: React.RefObject<HTMLTableRowElement | null>;
}) {
  const [account, setAccount] = useState<string | null>(null);
  const showAccount = async () => {
    const { data, error } = await sb.rpc("expense_request_account", { p_id: r.id });
    if (error) fail(dbError(error)); else setAccount(String(data ?? ""));
  };
  return (
    <>
      <tr ref={rowRef} className={`border-t border-line ${open ? "bg-primary-subtle" : ""}`}>
        <td className="px-3 py-2 text-label">{r.requested_at.slice(0, 10)}</td>
        <td className="text-heading">{r.requester_name ?? "-"}</td>
        <td className="text-label">{r.department ?? <span className="text-muted">미지정</span>}{r.item && ` / ${r.item}`}</td>
        <td className="text-heading">{r.content}</td>
        <td className="text-right font-medium text-heading">{won(Number(r.amount))}</td>
        <td className="text-center text-label">{r.used_at ?? "-"}</td>
        <td className="text-xs text-label">
          {r.account_masked ? <>{r.bank} {account ?? r.account_masked} {r.holder}{!account && <button onClick={showAccount} className="ml-1 text-primary">보기</button>}</> : "-"}
        </td>
        <td className="text-center">{r.drive_file_id ? <a href={`/api/receipts/${r.drive_file_id}`} className="text-primary" title="영수증 내려받기"><FontAwesomeIcon icon={faPaperclip} /></a> : <span className="text-muted">-</span>}</td>
        <td className="text-center">
          <span className={`rounded px-2 py-0.5 text-xs ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
          {r.expense_sunday && <div className="mt-0.5 text-xs text-muted">{r.expense_sunday} 지출</div>}
          {r.review_note && <div className="mt-0.5 max-w-40 truncate text-xs text-muted" title={r.review_note}>{r.review_note}</div>}
        </td>
        <td className="px-2 text-right">{r.status === "requested" && <button onClick={toggle} className={btn}>{open ? "닫기" : "검토"}</button>}</td>
      </tr>
      {open && <tr className="bg-primary-subtle"><td colSpan={10} className="px-3 pb-3"><Review r={r} done={done} fail={fail} sb={sb} /></td></tr>}
    </>
  );
}

function Review({ r, done, fail, sb }: { r: Row; done: (t: string) => void; fail: (t: string) => void; sb: NonNullable<ReturnType<typeof supabaseBrowser>> }) {
  const items = useDeptItems();
  const [deptId, setDeptId] = useState<number | null>(r.department_id);
  const [itemId, setItemId] = useState<number | null>(null);
  const [sunday, setSunday] = useState(currentSunday);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const dept = items.data?.find((d) => d.id === deptId);

  const approve = async () => {
    if (!itemId) return fail("부서와 항목을 골라 주세요.");
    if (new Date(sunday + "T00:00:00").getDay() !== 0) return fail("주일(일요일) 날짜를 골라 주세요.");
    setBusy(true);
    const { error } = await sb.rpc("approve_expense_request", { p_id: r.id, p_expense_item_id: itemId, p_sunday: sunday, p_note: note || null });
    setBusy(false);
    if (error) fail(`승인하지 못했어요: ${dbError(error)}`);
    else done(`${r.requester_name ?? ""} ${won(Number(r.amount))}원을 승인해 ${sunday} 주일 지출에 넣었어요.`);
  };
  const reject = async () => {
    if (!note.trim()) return fail("반려 사유를 적어 주세요.");
    setBusy(true);
    const { error } = await sb.rpc("reject_expense_request", { p_id: r.id, p_note: note });
    setBusy(false);
    if (error) fail(`반려하지 못했어요: ${dbError(error)}`); else done("반려했어요. 신청자 화면에 사유가 보여요.");
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded bg-surface p-3 text-sm">
      <label className="text-xs text-label">부서
        <select value={deptId ?? ""} onChange={(e) => { setDeptId(Number(e.target.value) || null); setItemId(null); }} className={`${input} mt-1 block`}>
          <option value="">부서 선택</option>
          {items.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-label">항목
        <select value={itemId ?? ""} onChange={(e) => setItemId(Number(e.target.value) || null)} disabled={!dept} className={`${input} mt-1 block`}>
          <option value="">항목 선택</option>
          {dept?.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-label">지출 주일
        <input type="date" value={sunday} onChange={(e) => setSunday(e.target.value)} className={`${input} mt-1 block`} />
      </label>
      <label className="min-w-48 flex-1 text-xs text-label">메모 / 반려 사유
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="반려할 때는 꼭 적어 주세요" className={`${input} mt-1 block w-full`} />
      </label>
      <button onClick={approve} disabled={busy} className={btnPrimary}>승인</button>
      <button onClick={reject} disabled={busy} className={`${btn} text-danger`}>반려</button>
    </div>
  );
}
