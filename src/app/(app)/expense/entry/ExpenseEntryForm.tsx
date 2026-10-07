"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperclip } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "@/components/PageHeader";
import { currentSunday, weekOfMonth } from "@/lib/demo";
import { useRefData, type RefData } from "@/lib/db/refData";
import { dbError, expenseProblems, expenseSig, loadExpense, saveExpense, type ExpenseRow as Row } from "@/lib/db/weekly";
import { supabaseBrowser } from "@/lib/supabase/client";
import { readFirstSheet } from "@/lib/bank/readXlsx";
import { parseNonghyupRows, type BankTx } from "@/lib/bank/nonghyup";

const KEY = "ndfms.expense.draft"; // 지출증빙 올리기 화면도 이 키에 행을 덧붙인다
const KEY_META = "ndfms.expense.draft.meta"; // {sunday, savedSig}
const won = (n: number) => n.toLocaleString("ko-KR");
const blank = (): Row => ({ id: crypto.randomUUID(), content: "", amount: 0, dept: "", item: "", requester: "", memo: "", source: "직접" });
const load = (): Row[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
type Meta = { sunday: string; savedSig: string | null };
const loadMeta = (): Meta | null => { try { return JSON.parse(localStorage.getItem(KEY_META) ?? "null"); } catch { return null; } };

export default function ExpenseEntryForm() {
  const { ref, error } = useRefData();
  if (error) return <><PageHeader /><div className="rounded bg-danger-subtle px-3 py-2 text-sm text-danger">기준정보를 불러오지 못했어요: {error}</div></>;
  if (!ref) return <><PageHeader /><div className="text-sm text-muted">불러오는 중…</div></>;
  return <Form ref_={ref} />;
}

function Form({ ref_ }: { ref_: RefData }) {
  const { departments: DEPARTMENTS, fixedExpenses: FIXED_EXPENSES, members: MEMBERS, demo } = ref_;
  const sb = supabaseBrowser();
  const [meta0] = useState(loadMeta);
  const [sunday, setSunday] = useState(() => (!demo && meta0?.sunday) || currentSunday());
  const [rows, setRows] = useState<Row[]>(load);
  const [savedSig, setSavedSig] = useState<string | null>(() => meta0?.savedSig ?? null);
  const [bankTx, setBankTx] = useState<(BankTx & { key: string })[]>([]);
  const [pick, setPick] = useState<Set<string>>(new Set());
  // 처음 열 때: 저장 안 한 행(증빙 올리기에서 넘어온 것 포함)이 있으면 이어서, 없으면 DB에서
  const [resumed] = useState(() => !demo && rows.length > 0 && meta0?.savedSig !== expenseSig(rows));
  const [msg, setMsg] = useState(resumed ? "저장하지 않은 지출을 이어서 보여드려요." : "");
  const [busy, setBusy] = useState(!demo && !resumed);
  const [err, setErr] = useState("");
  const dirty = !demo && savedSig !== expenseSig(rows);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch {} }, [rows]);
  useEffect(() => { try { localStorage.setItem(KEY_META, JSON.stringify({ sunday, savedSig })); } catch {} }, [sunday, savedSig]);

  const pull = useCallback((day: string) => sb && loadExpense(sb, day).then(
    (xs) => { setRows(xs); setSavedSig(expenseSig(xs)); },
    (e) => setErr(`불러오지 못했어요: ${dbError(e)}`),
  ).finally(() => setBusy(false)), [sb]);
  const fetchWeek = (day: string) => { setBusy(true); setErr(""); setMsg(""); pull(day); };

  useEffect(() => {
    if (!demo && !resumed) pull(sunday);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeSunday = (day: string) => {
    if (!day) return;
    if (dirty && !confirm("저장하지 않은 지출이 있어요. 버리고 다른 주일로 갈까요?")) return;
    setSunday(day); setMsg("");
    if (!demo) fetchWeek(day);
  };

  const save = async () => {
    if (!sb) return;
    const problems = expenseProblems(rows);
    if (problems.length) return setErr(`저장 전에 채워 주세요. ${problems.join(", ")}`);
    setBusy(true); setErr(""); setMsg("");
    try {
      const n = await saveExpense(sb, sunday, rows);
      setSavedSig(expenseSig(rows));
      setMsg(`${sunday} 주일 지출 ${n}건을 저장했어요.`);
    } catch (e) { setErr(`저장하지 못했어요: ${dbError(e)}`); }
    finally { setBusy(false); }
  };

  const set = (id: string, patch: Partial<Row>) => setRows((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byDept = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => r.dept && m.set(r.dept, (m.get(r.dept) ?? 0) + r.amount));
    return [...m];
  }, [rows]);

  const loadFixed = () => {
    const w = weekOfMonth(sunday);
    const add = FIXED_EXPENSES.filter((f) => f.weekOfMonth === w).map((f) => ({ ...blank(), ...f, source: "고정" as const }));
    setRows((xs) => [...xs, ...add]);
    setMsg(`${w}째 주 고정지출 ${add.length}건을 불러왔어요.`);
  };

  const onBank = async (f: File) => {
    const tx = parseNonghyupRows(await readFirstSheet(await f.arrayBuffer())).filter((t) => t.withdraw > 0);
    setBankTx(tx.map((t, i) => ({ ...t, key: `${t.txAt}-${i}` })));
    setPick(new Set());
  };
  const addBank = () => {
    const add = bankTx.filter((t) => pick.has(t.key)).map((t) => ({
      ...blank(), content: t.transferMemo || t.txMemo || t.description, amount: t.withdraw, memo: t.description, source: "은행" as const,
    }));
    setRows((xs) => [...xs, ...add]);
    setBankTx([]);
    setMsg(`은행 출금 ${add.length}건을 넣었어요. 부서·항목을 골라주세요.`);
  };

  // 송금용 파일: 은행 대량이체 양식은 [확인 필요]. 우선 공통 열로 만든다.
  const downloadTransfer = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("이체");
    ws.addRow(["받는분", "입금은행", "입금계좌", "이체금액", "받는분통장표시", "내통장표시"]);
    rows.forEach((r) => ws.addRow([r.requester, "", "", r.amount, "교회", r.content]));
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf]));
    a.download = `송금파일_${sunday.replace(/-/g, "").slice(2)}.xlsx`;
    a.click();
  };

  const input = "w-full rounded border px-1.5 py-1 text-sm";
  return (
    <>
      <PageHeader actions={demo
        ? <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">데모 데이터 · 브라우저에만 임시저장</span>
        : dirty && <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">저장 안 됨</span>} />

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-surface shadow-card p-4 text-sm">
        <label className="text-xs text-label">주일
          <input type="date" value={sunday} onChange={(e) => changeSunday(e.target.value)} className="mt-1 block rounded border px-2 py-1.5 text-sm text-heading" />
        </label>
        <button onClick={loadFixed} className="rounded border px-3 py-1.5">고정지출 불러오기</button>
        <label className="cursor-pointer rounded border px-3 py-1.5">은행 엑셀 업로드
          <input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && onBank(e.target.files[0])} />
        </label>
        <a href="/expense/upload" className="rounded border px-3 py-1.5">증빙·엑셀 올리기</a>
        <button onClick={() => setRows((xs) => [...xs, blank()])} className="rounded border px-3 py-1.5">행 추가</button>
        <a href="/expense/history" target="_blank" className="rounded border px-3 py-1.5">과거 지출내역</a>
        <button onClick={downloadTransfer} disabled={!rows.length} className="ml-auto rounded bg-primary px-4 py-1.5 text-white disabled:bg-slate-300">송금용 파일 다운로드</button>
      </div>
      {msg && <div className="mb-3 rounded bg-success-subtle px-3 py-2 text-sm text-success">{msg}</div>}
      {err && <div className="mb-3 rounded bg-danger-subtle px-3 py-2 text-sm text-danger">{err}</div>}

      {bankTx.length > 0 && (
        <div className="mb-4 rounded-lg border border-primary bg-surface p-3 text-sm">
          <div className="mb-2 flex justify-between"><b>은행 출금 내역에서 고르기</b>
            <button onClick={addBank} disabled={!pick.size} className="rounded bg-primary px-3 py-1 text-white disabled:bg-slate-300">선택 {pick.size}건 넣기</button></div>
          {bankTx.map((t) => (
            <label key={t.key} className="flex gap-3 border-t py-1">
              <input type="checkbox" checked={pick.has(t.key)} onChange={() => setPick((s) => { const n = new Set(s); if (n.has(t.key)) n.delete(t.key); else n.add(t.key); return n; })} />
              <span className="w-36">{t.txAt.slice(0, 16).replace("T", " ")}</span><span className="w-28 text-right">{won(t.withdraw)}</span>
              <span>{t.description}</span><span className="text-muted">{t.transferMemo}</span>
            </label>
          ))}
        </div>
      )}

      <datalist id="members">{MEMBERS.map((m) => <option key={m.id} value={m.name} />)}</datalist>
      <div className="overflow-x-auto rounded-lg bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-label">
            <tr><th className="w-10 py-2">#</th><th className="text-left">내용</th><th className="w-32 text-right">금액</th><th className="w-36">부서</th><th className="w-44">항목</th><th className="w-32">청구자</th><th className="text-left">비고</th><th className="w-16">출처</th><th className="w-12" /></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t">
                <td className="text-center text-muted">{i + 1}</td>
                <td className="px-1 py-1"><input className={input} value={r.content} onChange={(e) => set(r.id, { content: e.target.value })} /></td>
                <td className="px-1"><input className={`${input} text-right`} inputMode="numeric" value={r.amount ? won(r.amount) : ""} onChange={(e) => set(r.id, { amount: Number(e.target.value.replace(/\D/g, "")) })} /></td>
                <td className="px-1"><select className={input} value={r.dept} onChange={(e) => set(r.id, { dept: e.target.value, item: "" })}><option value="">선택</option>{Object.keys(DEPARTMENTS).map((d) => <option key={d}>{d}</option>)}</select></td>
                <td className="px-1"><select className={input} value={r.item} onChange={(e) => set(r.id, { item: e.target.value })}><option value="">선택</option>{(DEPARTMENTS[r.dept] ?? []).map((d) => <option key={d}>{d}</option>)}</select></td>
                <td className="px-1"><input className={input} list="members" value={r.requester} onChange={(e) => set(r.id, { requester: e.target.value })} /></td>
                <td className="px-1"><input className={input} value={r.memo} onChange={(e) => set(r.id, { memo: e.target.value })} /></td>
                <td className="text-center text-xs text-muted">{r.fileId ? <a href={`/api/receipts/${r.fileId}`} className="text-primary" title="드라이브에 저장된 증빙 내려받기"><FontAwesomeIcon icon={faPaperclip} /> {r.source}</a> : r.source}</td>
                <td className="text-center"><button onClick={() => setRows((xs) => xs.filter((x) => x.id !== r.id))} className="text-xs text-red-500">삭제</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="rounded-lg bg-surface shadow-card px-4 py-3">금주 지출 합계 <b>{won(total)}원</b> · {rows.length}건</div>
        {!demo && <button onClick={save} disabled={busy || !dirty} className="rounded bg-primary px-4 py-1.5 text-white disabled:bg-slate-300">{busy ? "처리 중…" : dirty ? "입력 완료(저장)" : "저장됨"}</button>}
        {byDept.map(([d, n]) => <div key={d} className="rounded-lg bg-surface shadow-card px-4 py-3">{d} {won(n)}</div>)}
      </div>
    </>
  );
}
